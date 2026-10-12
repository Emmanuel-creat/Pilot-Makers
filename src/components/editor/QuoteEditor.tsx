"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { StatusBadge } from "@/components/ui";
import { draftToCalcInput } from "@/lib/calc/draft";
import { computeQuote } from "@/lib/calc/engine";
import { bpToInput, formatEuros, formatPercent, price4ToInput } from "@/lib/calc/format";
import type { CatalogItem } from "@/lib/services/catalog";
import { checkCompliance, type ComplianceInput } from "@/lib/services/compliance";
import { CONTRACT_PLACES, consumerTerms, type ContractPlace } from "@/lib/services/consumer";
import type { DraftLine, DraftSection, QuoteDraft } from "@/lib/services/quote-types";
import { EDITOR_SHORTCUTS, shortcutText } from "@/lib/shortcuts";
import { apiFetch, ApiError, uid } from "./api";
import { AssistantPanel } from "./AssistantPanel";
import { CatalogPicker } from "./CatalogPicker";
import { CustomerForm } from "./CustomerForm";
import { LineRow, UNITS } from "./LineRow";
import { travelCostCents, travelLine, type Pricing, type TravelSettings } from "@/lib/services/pricing";

export interface EditorCustomer {
  id: string;
  type: string;
  civility: string;
  first_name: string;
  last_name: string;
  company_name: string;
  billing_line1: string;
  billing_line2: string;
  billing_postal_code: string;
  billing_city: string;
  site_same_as_billing: boolean;
  site_line1: string;
  site_line2: string;
  site_postal_code: string;
  site_city: string;
  email: string;
  phone: string;
  siren: string;
  vat_number?: string;
}

type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

export function customerName(c: Pick<EditorCustomer, "type" | "company_name" | "first_name" | "last_name" | "civility">) {
  if (c.type !== "particulier" && c.company_name) return c.company_name;
  return [c.civility, c.first_name, c.last_name].filter(Boolean).join(" ") || c.company_name || "Client sans nom";
}

function siteOf(c: EditorCustomer) {
  return c.site_same_as_billing
    ? { line1: c.billing_line1, line2: c.billing_line2, postalCode: c.billing_postal_code, city: c.billing_city }
    : { line1: c.site_line1, line2: c.site_line2, postalCode: c.site_postal_code, city: c.site_city };
}

function blankLine(patch: Partial<DraftLine> = {}): DraftLine {
  return {
    id: uid(),
    kind: "item",
    catalogItemId: null,
    nature: "main_oeuvre",
    label: "",
    description: "",
    quantity: "1",
    unit: "u",
    unitPrice: "",
    unitCost: "",
    discountPercent: "",
    vatPercent: "",
    estimated: false,
    estimateNote: "",
    ...patch,
  };
}

function payload(d: QuoteDraft) {
  return {
    customerId: d.customerId,
    title: d.title,
    description: d.description,
    site: d.site,
    validityDays: d.validityDays,
    paymentTerms: d.paymentTerms,
    specialConditions: d.specialConditions,
    depositPercent: d.depositPercent,
    estimatedDuration: d.estimatedDuration,
    estimatedStart: d.estimatedStart,
    globalDiscount: d.globalDiscount,
    template: d.template,
    internalNotes: d.internalNotes,
    contractPlace: d.contractPlace,
    reverseCharge: d.reverseCharge,
    retentionPercent: d.retentionPercent,
    sections: d.sections,
  };
}

export function QuoteEditor({
  initial,
  org,
  initialCustomer,
  showMargin,
  assistantQuota,
  defaultVat,
  openAssistant,
  pricing,
}: {
  initial: QuoteDraft;
  org: ComplianceInput["org"];
  initialCustomer: EditorCustomer | null;
  showMargin: boolean;
  assistantQuota: number;
  defaultVat: string;
  openAssistant: boolean;
  /** Taux horaires et barème des déplacements de l'entreprise */
  pricing: Pricing;
}) {
  const router = useRouter();
  const [d, setD] = useState<QuoteDraft>(initial);
  const [customer, setCustomer] = useState<EditorCustomer | null>(initialCustomer);
  const [save, setSave] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState("");
  const [toast, setToast] = useState("");
  const [picker, setPicker] = useState<string | null>(null);
  const [newCustomer, setNewCustomer] = useState(false);
  const [assistant, setAssistant] = useState(openAssistant);
  const [issueOpen, setIssueOpen] = useState(false);
  const [showCosts, setShowCosts] = useState(showMargin);
  const [drag, setDrag] = useState<{ s: string; l: string } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [travelFor, setTravelFor] = useState<string | null>(null);

  const revision = useRef(initial.draftRevision);
  const changeSeq = useRef(0);
  const savedSeq = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const latest = useRef(d);
  latest.current = d;
  const franchise = org.vat_regime === "franchise";
  const vatExempt = franchise || d.reverseCharge;

  /* Calculs et contrôles en direct (même moteur que le serveur) */
  const calc = useMemo(() => computeQuote(draftToCalcInput(d, vatExempt)), [d, vatExempt]);
  const issues = useMemo(
    () =>
      checkCompliance({
        org,
        customer: customer
          ? {
              type: customer.type,
              name: customerName(customer),
              billing_line1: customer.billing_line1,
              billing_postal_code: customer.billing_postal_code,
              billing_city: customer.billing_city,
              siren: customer.siren,
              vat_number: customer.vat_number,
            }
          : null,
        quote: {
          title: d.title,
          description: d.description,
          site_line1: d.site.line1,
          site_postal_code: d.site.postalCode,
          site_city: d.site.city,
          validity_days: d.validityDays,
          payment_terms: d.paymentTerms,
          deposit_percent: d.depositPercent,
          contract_place: d.contractPlace,
          reverse_charge: d.reverseCharge,
          retention_percent: d.retentionPercent,
        },
        lines: d.sections.flatMap((s) =>
          s.lines.map((l) => ({ kind: l.kind, nature: l.nature, label: l.label, estimated: l.estimated, vat_percent: l.vatPercent })),
        ),
        calc,
      }),
    [org, customer, d, calc],
  );
  const consumer = useMemo(
    () => consumerTerms(d.contractPlace, customer?.type, calc, org.vat_regime),
    [d.contractPlace, customer, calc, org.vat_regime],
  );
  // Remise guidée : effet de la remise globale sur la marge, connu avant d'émettre (lignes avec coût renseigné).
  const discountImpact = useMemo(() => {
    if (!showMargin || !calc.globalDiscountCents || calc.margin.linesWithoutCost > 0) return null;
    const without = computeQuote(draftToCalcInput({ ...d, globalDiscount: "" }, vatExempt));
    return {
      cost: calc.globalDiscountCents,
      before: without.margin.marginCents,
      after: calc.margin.marginCents,
      rateAfter: calc.margin.marginRateBp,
    };
  }, [calc, d, vatExempt, showMargin]);
  const blocking = issues.filter((i) => i.blocking);
  const warnings = issues.filter((i) => !i.blocking);
  const lineResults = useMemo(() => new Map(calc.sections.flatMap((s) => s.lines.map((l) => [l.id, l] as const))), [calc]);

  /* Sauvegarde automatique */
  const doSave = useCallback(async (): Promise<void> => {
    if (inFlight.current) {
      await inFlight.current;
      if (savedSeq.current >= changeSeq.current) return;
    }
    const seq = changeSeq.current;
    setSave("saving");
    const p = (async () => {
      try {
        const r = await apiFetch<{ draftRevision: number }>(`/api/quotes/${initial.id}`, {
          method: "PATCH",
          json: { draftRevision: revision.current, quote: payload(latest.current) },
        });
        revision.current = r.draftRevision;
        savedSeq.current = seq;
        setSaveError("");
        setSave(changeSeq.current > seq ? "dirty" : "saved");
      } catch (e) {
        if (e instanceof ApiError && e.code === "revision_conflict") {
          setSave("conflict");
          revision.current = Number(e.data.currentRevision ?? revision.current);
        } else {
          setSave("error");
          setSaveError(e instanceof ApiError ? e.message : "Enregistrement impossible");
        }
      }
    })();
    inFlight.current = p;
    await p;
    inFlight.current = null;
  }, [initial.id]);

  useEffect(() => {
    if (save !== "dirty") return;
    const t = setTimeout(() => void doSave(), 1000);
    return () => clearTimeout(t);
  }, [d, save, doSave]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (savedSeq.current < changeSeq.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  useEffect(() => {
    // L'assistant ne se rouvre pas au rechargement de la page.
    if (openAssistant) window.history.replaceState(null, "", `/app/devis/${initial.id}`);
  }, [openAssistant, initial.id]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const saveAsTemplate = async () => {
    const name = window.prompt("Nom du modèle (ex. : Salle de bain complète)", d.title);
    if (!name?.trim()) return;
    await flush();
    try {
      await apiFetch("/api/quote-templates", { method: "POST", json: { quoteId: initial.id, name } });
      setToast(`Modèle « ${name.trim()} » enregistré`);
    } catch (e) {
      setToast(e instanceof ApiError ? e.message : "Enregistrement du modèle impossible");
    }
  };

  const flush = async () => {
    if (savedSeq.current < changeSeq.current || save === "dirty" || save === "saving") await doSave();
  };

  /* Historique pour annuler et rétablir. Les frappes rapprochées forment une seule étape. */
  const past = useRef<QuoteDraft[]>([]);
  const future = useRef<QuoteDraft[]>([]);
  const lastPush = useRef(0);
  const [, setHistoryTick] = useState(0);
  const markDirty = () => {
    changeSeq.current++;
    setSave((s) => (s === "conflict" ? s : "dirty"));
  };
  const update = (fn: (d: QuoteDraft) => QuoteDraft) => {
    const before = latest.current;
    const next = fn(before);
    if (next === before) return;
    const now = Date.now();
    if (now - lastPush.current > 800 || past.current.length === 0) {
      past.current = [...past.current.slice(-99), before];
    }
    lastPush.current = now;
    future.current = [];
    latest.current = next;
    setD(next);
    setHistoryTick((t) => t + 1);
    markDirty();
  };
  const undo = () => {
    const prev = past.current.at(-1);
    if (!prev) return;
    past.current = past.current.slice(0, -1);
    future.current = [latest.current, ...future.current];
    lastPush.current = 0;
    latest.current = prev;
    setD(prev);
    setHistoryTick((t) => t + 1);
    markDirty();
  };
  const redo = () => {
    const next = future.current[0];
    if (!next) return;
    future.current = future.current.slice(1);
    past.current = [...past.current, latest.current];
    lastPush.current = 0;
    latest.current = next;
    setD(next);
    setHistoryTick((t) => t + 1);
    markDirty();
  };
  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  const flushRef = useRef(flush);
  undoRef.current = undo;
  redoRef.current = redo;
  flushRef.current = flush;
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undoRef.current();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redoRef.current();
      } else if (k === "s") {
        e.preventDefault();
        void flushRef.current();
      } else if (k === "k") {
        e.preventDefault();
        const sections = latest.current.sections;
        if (sections.length) setPicker(sections[sections.length - 1].id);
      } else if (k === "?" || (k === "/" && e.shiftKey)) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const set = <K extends keyof QuoteDraft>(k: K, v: QuoteDraft[K]) => update((o) => ({ ...o, [k]: v }));
  const setSection = (sid: string, fn: (s: DraftSection) => DraftSection) =>
    update((o) => ({ ...o, sections: o.sections.map((s) => (s.id === sid ? fn(s) : s)) }));
  const setLine = (sid: string, lid: string, patch: Partial<DraftLine>) =>
    setSection(sid, (s) => ({ ...s, lines: s.lines.map((l) => (l.id === lid ? { ...l, ...patch } : l)) }));
  const addLines = (sid: string, lines: DraftLine[]) => setSection(sid, (s) => ({ ...s, lines: [...s.lines, ...lines] }));

  const moveLine = (sid: string, lid: string, dir: -1 | 1) =>
    update((o) => {
      const flat = o.sections.flatMap((s) => s.lines.map((l) => ({ s: s.id, l })));
      const i = flat.findIndex((x) => x.l.id === lid);
      const s = o.sections.findIndex((x) => x.id === sid);
      const sec = o.sections[s];
      const idx = sec.lines.findIndex((l) => l.id === lid);
      const j = idx + dir;
      if (j >= 0 && j < sec.lines.length) {
        const lines = [...sec.lines];
        [lines[idx], lines[j]] = [lines[j], lines[idx]];
        return { ...o, sections: o.sections.map((x) => (x.id === sid ? { ...x, lines } : x)) };
      }
      // Passage à la section voisine
      const target = o.sections[s + dir];
      if (!target || i < 0) return o;
      const line = sec.lines[idx];
      return {
        ...o,
        sections: o.sections.map((x) =>
          x.id === sid
            ? { ...x, lines: x.lines.filter((l) => l.id !== lid) }
            : x.id === target.id
              ? { ...x, lines: dir === 1 ? [line, ...x.lines] : [...x.lines, line] }
              : x,
        ),
      };
    });

  const dropOn = (targetSection: string, targetLine: string | null) => {
    if (!drag || drag.l === targetLine) return;
    update((o) => {
      const line = o.sections.find((s) => s.id === drag.s)?.lines.find((l) => l.id === drag.l);
      if (!line) return o;
      const sections = o.sections.map((s) => ({ ...s, lines: s.lines.filter((l) => l.id !== drag.l) }));
      return {
        ...o,
        sections: sections.map((s) => {
          if (s.id !== targetSection) return s;
          const lines = [...s.lines];
          const at = targetLine ? lines.findIndex((l) => l.id === targetLine) : lines.length;
          lines.splice(at < 0 ? lines.length : at, 0, line);
          return { ...s, lines };
        }),
      };
    });
    setDrag(null);
    setDragOver(null);
  };

  const moveSection = (sid: string, dir: -1 | 1) =>
    update((o) => {
      const i = o.sections.findIndex((s) => s.id === sid);
      const j = i + dir;
      if (j < 0 || j >= o.sections.length) return o;
      const sections = [...o.sections];
      [sections[i], sections[j]] = [sections[j], sections[i]];
      return { ...o, sections };
    });

  const removeSection = (s: DraftSection) => {
    if (s.lines.length && !confirm(`Supprimer la section « ${s.title || "sans titre"} » et ses ${s.lines.length} ligne(s) ?`)) return;
    update((o) => ({ ...o, sections: o.sections.length > 1 ? o.sections.filter((x) => x.id !== s.id) : [{ ...s, title: "", lines: [] }] }));
  };

  const fromCatalog = (items: CatalogItem[]): DraftLine[] =>
    items.map((it) =>
      blankLine({
        catalogItemId: it.id,
        nature: it.category,
        label: it.name,
        description: [it.description, it.composition_text].filter(Boolean).join("\n"),
        unit: it.unit,
        unitPrice: price4ToInput(it.unit_price4),
        unitCost: it.unit_cost4 === null ? "" : price4ToInput(it.unit_cost4),
        vatPercent: franchise ? "0" : bpToInput(it.vat_bp),
        ...(it.waste_bp ? { wastePercent: bpToInput(it.waste_bp) } : {}),
        estimated: it.source === "library",
        estimateNote: it.source === "library" ? "tarif indicatif de la bibliothèque, à adapter" : "",
      }),
    );

  const saveToCatalog = async (sid: string, l: DraftLine) => {
    try {
      const r = await apiFetch<{ id: string }>("/api/catalog-items", {
        method: "POST",
        json: {
          name: l.label,
          description: l.description,
          category: l.nature,
          unit: l.unit || "u",
          unit_price: l.unitPrice,
          unit_cost: l.unitCost,
          vat_percent: l.vatPercent || "20",
        },
      });
      setLine(sid, l.id, { catalogItemId: r.id });
      setToast("Prestation enregistrée dans le catalogue");
    } catch (e) {
      setToast(e instanceof ApiError ? e.message : "Enregistrement impossible");
    }
  };

  const chooseCustomer = async (id: string) => {
    try {
      const r = await apiFetch<{ customer: EditorCustomer }>(`/api/customers/${id}`);
      setCustomer(r.customer);
      update((o) => ({
        ...o,
        customerId: id,
        site: o.site.line1 || o.site.city ? o.site : siteOf(r.customer),
      }));
    } catch (e) {
      setToast(e instanceof ApiError ? e.message : "Client introuvable");
    }
  };

  const reload = () => {
    changeSeq.current = savedSeq.current;
    window.location.reload();
  };

  const overwrite = async () => {
    setSave("dirty");
    await doSave();
  };

  const preview = async () => {
    await flush();
    window.open(`/api/quotes/${initial.id}/preview-pdf`, "_blank", "noopener");
  };

  const lineCount = d.sections.reduce((n, s) => n + s.lines.filter((l) => l.kind !== "note").length, 0);

  return (
    <div className="pb-28 lg:pb-8">
      <datalist id="units">
        {UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      {/* Barre supérieure */}
      <div className="sticky top-0 z-30 -mx-4 mb-4 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/app/devis" className="btn-ghost min-h-9 px-2" aria-label="Retour aux devis">
            <Icon name="left" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold">{d.number ?? "Nouveau devis"}</h1>
              <StatusBadge status={calc.ok ? "draft" : "incomplete"} />
              {d.currentVersion > 0 ? <span className="text-xs text-muted">version {d.currentVersion + 1} en préparation</span> : null}
            </div>
            <SaveIndicator state={save} error={saveError} />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center">
              <button
                type="button"
                className="btn-ghost min-h-9 px-2"
                onClick={undo}
                disabled={past.current.length === 0}
                aria-label="Annuler la dernière modification"
                title="Annuler (Ctrl+Z)"
              >
                <Icon name="undo" />
              </button>
              <button
                type="button"
                className="btn-ghost min-h-9 px-2"
                onClick={redo}
                disabled={future.current.length === 0}
                aria-label="Rétablir la modification annulée"
                title="Rétablir (Ctrl+Maj+Z)"
              >
                <Icon name="redo" />
              </button>
            </div>
            <button
              type="button"
              className="btn-ghost hidden min-h-9 px-2 md:inline-flex"
              onClick={() => setShortcutsOpen(true)}
              aria-label="Raccourcis clavier"
              title="Raccourcis clavier (Ctrl+Maj+?)"
            >
              <Icon name="keyboard" />
            </button>
            <button
              type="button"
              className="btn-ghost hidden min-h-9 md:inline-flex"
              onClick={saveAsTemplate}
              title="Enregistrer comme modèle de devis"
            >
              <Icon name="copy" size={16} /> Modèle
            </button>
            <button type="button" className="btn-secondary hidden sm:inline-flex" onClick={preview}>
              <Icon name="eye" size={16} /> Aperçu PDF
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={async () => {
                await flush();
                setIssueOpen(true);
              }}
              disabled={save === "conflict"}
            >
              <Icon name="check" size={16} /> Émettre
            </button>
          </div>
        </div>
      </div>

      {save === "conflict" ? (
        <div className="mb-4 rounded-md border border-danger/40 bg-danger-soft p-4 text-sm" role="alert">
          <p className="font-medium">Ce devis a été modifié ailleurs (autre onglet ou autre appareil).</p>
          <p className="mt-1">Vos modifications sont toujours affichées ici. Choisissez la version à garder.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={reload}>
              Recharger l'autre version
            </button>
            <button type="button" className="btn-danger" onClick={overwrite}>
              Garder ma version
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {/* Client */}
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-semibold">
                <Icon name="user" size={18} className="text-muted" /> Client
              </h2>
              <button type="button" className="link text-sm" onClick={() => setNewCustomer(true)}>
                Nouveau client
              </button>
            </div>
            <CustomerSearch
              customer={customer}
              onPick={chooseCustomer}
              onClear={() => {
                setCustomer(null);
                set("customerId", null);
              }}
            />
          </section>

          {/* Chantier */}
          <section className="card space-y-4 p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <Icon name="pin" size={18} className="text-muted" /> Chantier
            </h2>
            <div>
              <label className="label" htmlFor="q-title">
                Objet des travaux
              </label>
              <input
                id="q-title"
                className="field"
                value={d.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Ex. : Rénovation de la salle de bain"
              />
            </div>
            <div>
              <label className="label" htmlFor="q-desc">
                Description
              </label>
              <textarea
                id="q-desc"
                rows={3}
                className="field"
                value={d.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Décrivez précisément les travaux prévus"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_120px_1fr]">
              <div>
                <label className="label" htmlFor="q-site1">
                  Adresse du chantier
                </label>
                <input id="q-site1" className="field" value={d.site.line1} onChange={(e) => set("site", { ...d.site, line1: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="q-sitecp">
                  Code postal
                </label>
                <input
                  id="q-sitecp"
                  inputMode="numeric"
                  className="field"
                  value={d.site.postalCode}
                  onChange={(e) => set("site", { ...d.site, postalCode: e.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="q-sitecity">
                  Ville
                </label>
                <input id="q-sitecity" className="field" value={d.site.city} onChange={(e) => set("site", { ...d.site, city: e.target.value })} />
              </div>
            </div>
            {customer && (d.site.line1 !== siteOf(customer).line1 || d.site.city !== siteOf(customer).city) ? (
              <button type="button" className="link text-sm" onClick={() => set("site", siteOf(customer))}>
                Reprendre l'adresse du client
              </button>
            ) : null}
          </section>

          {/* Prestations */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-semibold">
                <Icon name="box" size={18} className="text-muted" /> Prestations
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {showMargin ? (
                  <label className="flex items-center gap-1.5 text-sm text-muted">
                    <input type="checkbox" className="h-4 w-4" checked={showCosts} onChange={(e) => setShowCosts(e.target.checked)} />
                    Coûts internes
                  </label>
                ) : null}
                {assistantQuota > 0 ? (
                  <button type="button" className="btn-secondary" onClick={() => setAssistant(true)}>
                    <Icon name="wand" size={16} /> Assistant
                  </button>
                ) : null}
              </div>
            </div>
            {d.sections.map((s, si) => {
              const sres = calc.sections.find((x) => x.id === s.id);
              return (
                <div
                  key={s.id}
                  className="card p-3 sm:p-4"
                  onDragOver={(e) => {
                    if (drag) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragOver === null) dropOn(s.id, null);
                  }}
                >
                  <div className="mb-3 flex items-start gap-2">
                    <input
                      value={s.title}
                      onChange={(e) => setSection(s.id, (x) => ({ ...x, title: e.target.value }))}
                      placeholder={d.sections.length > 1 ? `Section ${si + 1} (ex. Préparation, Sol, Murs)` : "Titre de section (facultatif)"}
                      className="field-sm flex-1 font-semibold"
                      aria-label="Titre de la section"
                    />
                    {d.sections.length > 1 ? (
                      <div className="flex shrink-0">
                        <button
                          type="button"
                          className="btn-ghost min-h-8 px-1.5"
                          onClick={() => moveSection(s.id, -1)}
                          disabled={si === 0}
                          aria-label="Monter la section"
                        >
                          <Icon name="up" size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn-ghost min-h-8 px-1.5"
                          onClick={() => moveSection(s.id, 1)}
                          disabled={si === d.sections.length - 1}
                          aria-label="Descendre la section"
                        >
                          <Icon name="down" size={16} />
                        </button>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="btn-ghost min-h-8 px-1.5 text-muted"
                      onClick={() => removeSection(s)}
                      aria-label="Supprimer la section"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {s.lines.map((l) => (
                      <LineRow
                        key={l.id}
                        line={l}
                        result={lineResults.get(l.id)}
                        issues={calc.issues.filter((i) => i.lineId === l.id)}
                        showCosts={showCosts}
                        laborRates={pricing.laborRates}
                        coefficient={pricing.coefficients[l.nature as keyof Pricing["coefficients"]] ?? 0}
                        vatExempt={vatExempt}
                        readOnly={false}
                        onChange={(patch) => setLine(s.id, l.id, patch)}
                        onRemove={() => setSection(s.id, (x) => ({ ...x, lines: x.lines.filter((y) => y.id !== l.id) }))}
                        onDuplicate={() =>
                          setSection(s.id, (x) => {
                            const i = x.lines.findIndex((y) => y.id === l.id);
                            const lines = [...x.lines];
                            lines.splice(i + 1, 0, { ...l, id: uid() });
                            return { ...x, lines };
                          })
                        }
                        onMove={(dir) => moveLine(s.id, l.id, dir)}
                        onSaveToCatalog={() => saveToCatalog(s.id, l)}
                        dragHandlers={{
                          draggable: true,
                          onDragStart: (e) => {
                            const tag = (e.target as HTMLElement).tagName;
                            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
                              e.preventDefault();
                              return;
                            }
                            e.dataTransfer.effectAllowed = "move";
                            setDrag({ s: s.id, l: l.id });
                          },
                          onDragOver: (e) => {
                            if (!drag) return;
                            e.preventDefault();
                            setDragOver(l.id);
                          },
                          onDrop: (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            dropOn(s.id, l.id);
                          },
                          onDragEnd: () => {
                            setDrag(null);
                            setDragOver(null);
                          },
                        }}
                        dragOver={dragOver === l.id && drag?.l !== l.id}
                      />
                    ))}
                    {s.lines.length === 0 ? (
                      <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-sm text-muted">
                        Aucune ligne dans cette section.
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" className="btn-secondary min-h-9 text-sm" onClick={() => setPicker(s.id)}>
                      <Icon name="box" size={16} /> Catalogue
                    </button>
                    <button
                      type="button"
                      className="btn-ghost min-h-9 text-sm"
                      onClick={() => addLines(s.id, [blankLine({ vatPercent: franchise ? "0" : defaultVat })])}
                    >
                      <Icon name="plus" size={16} /> Ligne libre
                    </button>
                    <button
                      type="button"
                      className="btn-ghost min-h-9 text-sm"
                      onClick={() => addLines(s.id, [blankLine({ kind: "pending", quantity: "", vatPercent: franchise ? "0" : defaultVat })])}
                    >
                      <Icon name="clock" size={16} /> À compléter
                    </button>
                    <button
                      type="button"
                      className="btn-ghost min-h-9 text-sm"
                      onClick={() => addLines(s.id, [blankLine({ kind: "note", quantity: "" })])}
                    >
                      <Icon name="note" size={16} /> Note
                    </button>
                    {pricing.travel.fixedCents || pricing.travel.perKmCents ? (
                      <button
                        type="button"
                        className="btn-ghost min-h-9 text-sm"
                        onClick={() => setTravelFor((t) => (t === s.id ? null : s.id))}
                        aria-expanded={travelFor === s.id}
                      >
                        <Icon name="truck" size={16} /> Déplacement
                      </button>
                    ) : null}
                    {sres && d.sections.length > 1 ? (
                      <span className="tabular ml-auto text-sm text-muted">
                        Sous-total : <strong className="text-ink">{formatEuros(sres.subtotalCents)}</strong>
                      </span>
                    ) : null}
                  </div>
                  {travelFor === s.id ? (
                    <TravelForm
                      travel={pricing.travel}
                      onAdd={(km, trips) => {
                        addLines(s.id, [blankLine({ ...travelLine(pricing.travel, km, trips), vatPercent: franchise ? "0" : defaultVat })]);
                        setTravelFor(null);
                      }}
                      onCancel={() => setTravelFor(null)}
                    />
                  ) : null}
                </div>
              );
            })}
            <button
              type="button"
              className="btn-secondary w-full border-dashed"
              onClick={() => update((o) => ({ ...o, sections: [...o.sections, { id: uid(), title: "", description: "", lines: [] }] }))}
            >
              <Icon name="section" size={16} /> Ajouter une section
            </button>
          </section>

          {/* Conditions */}
          <section className="card space-y-4 p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <Icon name="note" size={18} className="text-muted" /> Conditions
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="q-valid">
                  Validité (jours)
                </label>
                <input
                  id="q-valid"
                  type="number"
                  min={1}
                  max={365}
                  className="field"
                  value={d.validityDays || ""}
                  onChange={(e) => set("validityDays", Math.max(0, Math.min(365, Number(e.target.value) || 0)))}
                />
              </div>
              <div>
                <label className="label" htmlFor="q-deposit">
                  Acompte (%)
                </label>
                <input
                  id="q-deposit"
                  inputMode="decimal"
                  className="field"
                  value={d.depositPercent}
                  onChange={(e) => set("depositPercent", e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="label" htmlFor="q-discount">
                  Remise globale (%)
                </label>
                <input
                  id="q-discount"
                  inputMode="decimal"
                  className="field"
                  value={d.globalDiscount}
                  onChange={(e) => set("globalDiscount", e.target.value)}
                  placeholder="0"
                  aria-describedby={discountImpact ? "q-discount-impact" : undefined}
                />
                {discountImpact ? (
                  <p id="q-discount-impact" className={`mt-1 text-xs ${discountImpact.after < 0 ? "text-danger" : "text-muted"}`}>
                    Remise de {formatEuros(discountImpact.cost)} HT : la marge prévue passe de {formatEuros(discountImpact.before)} à{" "}
                    {formatEuros(discountImpact.after)}
                    {discountImpact.rateAfter !== null ? ` (${formatPercent(discountImpact.rateAfter)} du prix de vente)` : ""}.
                    {discountImpact.after < 0 ? " Le devis serait vendu à perte." : ""}
                  </p>
                ) : null}
              </div>
              <div>
                <label className="label" htmlFor="q-start">
                  Début estimé
                </label>
                <input
                  id="q-start"
                  className="field"
                  value={d.estimatedStart}
                  onChange={(e) => set("estimatedStart", e.target.value)}
                  placeholder="Ex. : semaine du 2 novembre"
                />
              </div>
              <div>
                <label className="label" htmlFor="q-duration">
                  Durée estimée
                </label>
                <input
                  id="q-duration"
                  className="field"
                  value={d.estimatedDuration}
                  onChange={(e) => set("estimatedDuration", e.target.value)}
                  placeholder="Ex. : 5 jours"
                />
              </div>
              <div>
                <label className="label" htmlFor="q-template">
                  Modèle de PDF
                </label>
                <select id="q-template" className="field" value={d.template} onChange={(e) => set("template", e.target.value)}>
                  <option value="classique">Classique</option>
                  <option value="moderne">Moderne</option>
                  <option value="sobre">Sobre</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="q-place">
                  Lieu de signature du contrat
                </label>
                <select
                  id="q-place"
                  className="field"
                  value={d.contractPlace}
                  onChange={(e) => set("contractPlace", e.target.value as ContractPlace)}
                >
                  {(Object.entries(CONTRACT_PLACES) as [ContractPlace, string][]).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted">
                  {consumer.withdrawal
                    ? "Délai de rétractation de 14 jours : la mention et le formulaire seront joints au devis."
                    : "Pas de délai de rétractation pour ce devis."}
                  {consumer.reducedVatBp.length ? " Le client attestera les conditions du taux réduit de TVA en acceptant." : ""}
                </p>
              </div>
            </div>
            {customer && customer.type !== "particulier" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <span className="label">Sous-traitance</span>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4"
                      checked={d.reverseCharge}
                      disabled={franchise}
                      onChange={(e) => set("reverseCharge", e.target.checked)}
                    />
                    <span>
                      Travaux en sous-traitance : TVA autoliquidée par le client
                      <span className="block text-xs text-muted">Le devis et les factures sont établis hors TVA, avec la mention légale.</span>
                    </span>
                  </label>
                </div>
                <div>
                  <label className="label" htmlFor="q-retention">
                    Retenue de garantie
                  </label>
                  <select id="q-retention" className="field" value={d.retentionPercent} onChange={(e) => set("retentionPercent", e.target.value)}>
                    <option value="">Aucune</option>
                    <option value="5">5 % du TTC</option>
                  </select>
                  <p className="mt-1 text-xs text-muted">Déduite de la facture de solde, libérée un an après la réception.</p>
                </div>
              </div>
            ) : null}
            <div>
              <label className="label" htmlFor="q-payment">
                Conditions de paiement
              </label>
              <textarea id="q-payment" rows={2} className="field" value={d.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="q-special">
                Conditions particulières
              </label>
              <textarea
                id="q-special"
                rows={2}
                className="field"
                value={d.specialConditions}
                onChange={(e) => set("specialConditions", e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="q-internal">
                Notes internes <span className="font-normal text-muted">(jamais visibles par le client)</span>
              </label>
              <textarea id="q-internal" rows={2} className="field" value={d.internalNotes} onChange={(e) => set("internalNotes", e.target.value)} />
            </div>
          </section>
        </div>

        {/* Panneau latéral */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="card p-4">
            <Totals calc={calc} vatExempt={vatExempt} reverseCharge={!franchise && d.reverseCharge} />
            {showMargin ? (
              <div className="mt-3 rounded-md bg-surface-2 p-3 text-sm">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  <Icon name="lock" size={12} /> Interne, jamais sur le devis
                </div>
                <div className="mt-1 flex justify-between">
                  <span>Coûts estimés</span>
                  <span className="tabular">{formatEuros(calc.margin.costCents)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Marge prévisionnelle</span>
                  <span
                    className={`tabular ${calc.margin.linesWithoutCost ? "text-muted" : calc.margin.marginCents < 0 ? "text-danger" : "text-success"}`}
                  >
                    {calc.margin.linesWithoutCost ? "Incomplète" : formatEuros(calc.margin.marginCents)}
                    {!calc.margin.linesWithoutCost && calc.margin.marginRateBp !== null ? ` (${formatPercent(calc.margin.marginRateBp)})` : ""}
                  </span>
                </div>
                {!calc.margin.linesWithoutCost && calc.margin.markupRateBp !== null ? (
                  <div className="flex justify-between text-xs text-muted">
                    <span>Coefficient sur coûts</span>
                    <span className="tabular">+{formatPercent(calc.margin.markupRateBp)}</span>
                  </div>
                ) : null}
                {calc.margin.linesWithoutCost ? (
                  <p className="mt-1 text-xs text-warning">
                    Renseignez le coût interne de {calc.margin.linesWithoutCost} ligne(s) pour calculer la marge.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="card p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              {blocking.length ? <Icon name="alert" size={16} className="text-danger" /> : <Icon name="check" size={16} className="text-success" />}
              {blocking.length ? `${blocking.length} point(s) à corriger avant l'émission` : "Prêt à être émis"}
            </h2>
            {blocking.length ? (
              <ul className="mt-2 space-y-1.5 text-sm">
                {blocking.map((i, n) => (
                  <li key={i.code + n} className="flex gap-2 text-danger">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
                    <span>
                      {i.message}
                      {i.field?.startsWith("org.") ? (
                        <>
                          {" "}
                          <Link href="/app/entreprise" className="link">
                            Compléter
                          </Link>
                        </>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {warnings.length ? (
              <details className="mt-3 text-sm" open={!blocking.length}>
                <summary className="cursor-pointer text-muted">{warnings.length} point(s) d'attention</summary>
                <ul className="mt-2 space-y-1.5">
                  {warnings.map((i, n) => (
                    <li key={i.code + n} className="flex gap-2 text-warning">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                      <span className="text-ink">{i.message}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <p className="mt-3 text-xs text-muted">
              Ces contrôles aident à ne rien oublier. Ils ne remplacent pas la vérification des règles propres à votre métier.
            </p>
          </section>
          <button type="button" className="btn-secondary w-full sm:hidden" onClick={preview}>
            <Icon name="eye" size={16} /> Aperçu PDF
          </button>
        </aside>
      </div>

      {/* Barre mobile */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-line bg-surface px-4 py-2 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-muted">
              {lineCount} ligne(s), HT {formatEuros(calc.totalHtCents)}
            </div>
            <div className="tabular font-semibold">{formatEuros(calc.totalTtcCents)} TTC</div>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={async () => {
              await flush();
              setIssueOpen(true);
            }}
            disabled={save === "conflict"}
          >
            Émettre
          </button>
        </div>
      </div>

      {toast ? (
        <div
          className="fixed bottom-36 left-1/2 z-50 -translate-x-1/2 rounded-md bg-ink px-4 py-2 text-sm text-bg shadow-lg lg:bottom-6"
          role="status"
        >
          {toast}
        </div>
      ) : null}

      <CatalogPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        onPick={(items) => {
          if (picker) addLines(picker, fromCatalog(items));
        }}
      />
      <Modal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Raccourcis clavier">
        <dl className="space-y-2 text-sm">
          {EDITOR_SHORTCUTS.map((sc) => (
            <div key={sc.label} className="flex items-center justify-between gap-4">
              <dt className="text-muted">{sc.label}</dt>
              <dd className="shrink-0">
                <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-xs">{shortcutText(sc.keys)}</kbd>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-muted">Sur Mac, Cmd remplace Ctrl.</p>
      </Modal>
      <Modal open={newCustomer} onClose={() => setNewCustomer(false)} title="Nouveau client" wide>
        <CustomerForm
          compact
          onCancel={() => setNewCustomer(false)}
          onSaved={(id) => {
            setNewCustomer(false);
            chooseCustomer(id);
          }}
        />
      </Modal>
      {assistantQuota > 0 ? (
        <AssistantPanel
          quoteId={d.id}
          open={assistant}
          onClose={() => setAssistant(false)}
          initialText={d.description}
          autoRun={openAssistant}
          onAdd={(sections) =>
            update((o) => {
              const empty = o.sections.length === 1 && o.sections[0].lines.length === 0 && !o.sections[0].title;
              return { ...o, sections: empty ? sections : [...o.sections, ...sections] };
            })
          }
        />
      ) : null}
      <IssueDialog
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        quoteId={initial.id}
        revision={revision}
        blocking={blocking.map((b) => b.message)}
        estimated={d.sections.flatMap((s) => s.lines).filter((l) => l.estimated && l.kind === "item").length}
        customer={customer ? customerName(customer) : ""}
        ttc={calc.totalTtcCents}
        isRevision={d.currentVersion > 0}
        onIssued={() => {
          changeSeq.current = savedSeq.current;
          router.refresh();
        }}
      />
    </div>
  );
}

function SaveIndicator({ state, error }: { state: SaveState; error: string }) {
  const map: Record<SaveState, [string, string]> = {
    saved: ["text-muted", "Enregistré"],
    dirty: ["text-muted", "Modifications en cours..."],
    saving: ["text-muted", "Enregistrement..."],
    error: ["text-danger", error || "Non enregistré"],
    conflict: ["text-danger", "Conflit de modification"],
  };
  const [cls, label] = map[state];
  return (
    <div className={`flex items-center gap-1 text-xs ${cls}`} aria-live="polite">
      {state === "saved" ? (
        <Icon name="check" size={12} />
      ) : state === "error" || state === "conflict" ? (
        <Icon name="alert" size={12} />
      ) : (
        <Icon name="refresh" size={12} />
      )}
      {label}
    </div>
  );
}

export function Totals({
  calc,
  vatExempt,
  reverseCharge = false,
}: {
  calc: ReturnType<typeof computeQuote>;
  vatExempt: boolean;
  reverseCharge?: boolean;
}) {
  return (
    <dl className="space-y-1.5 text-sm">
      {calc.lineDiscountCents ? <Row label="Total avant remises" value={formatEuros(calc.grossCents)} muted /> : null}
      {calc.lineDiscountCents ? <Row label="Remises sur lignes" value={"-" + formatEuros(calc.lineDiscountCents)} muted /> : null}
      {calc.globalDiscountCents ? (
        <>
          <Row label="Sous-total HT" value={formatEuros(calc.subtotalCents)} muted />
          <Row label={`Remise globale ${formatPercent(calc.globalDiscountBp)}`} value={"-" + formatEuros(calc.globalDiscountCents)} muted />
        </>
      ) : null}
      <Row label="Total HT" value={formatEuros(calc.totalHtCents)} strong />
      {vatExempt ? (
        <p className="text-xs text-muted">
          {reverseCharge ? "TVA autoliquidée par le client, article 283-2 nonies du CGI" : "TVA non applicable, article 293 B du CGI"}
        </p>
      ) : (
        calc.vatGroups.map((g) => (
          <Row key={g.vatBp} label={`TVA ${formatPercent(g.vatBp)} sur ${formatEuros(g.baseCents)}`} value={formatEuros(g.vatCents)} muted />
        ))
      )}
      <div className="border-t border-line pt-2">
        <Row label="Total TTC" value={formatEuros(calc.totalTtcCents)} big />
      </div>
      {calc.options ? (
        <p className="text-xs text-muted">
          {calc.options.count > 1 ? `${calc.options.count} options` : "1 option"} non comprise(s) : {formatEuros(calc.options.htCents)} HT, au choix du client.
        </p>
      ) : null}
    </dl>
  );
}

function Row({ label, value, muted, strong, big }: { label: string; value: string; muted?: boolean; strong?: boolean; big?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${muted ? "text-muted" : ""} ${strong ? "font-medium" : ""} ${big ? "text-lg font-semibold" : ""}`}>
      <dt>{label}</dt>
      <dd className="tabular text-right whitespace-nowrap">{value}</dd>
    </div>
  );
}

function CustomerSearch({ customer, onPick, onClear }: { customer: EditorCustomer | null; onPick: (id: string) => void; onClear: () => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<EditorCustomer[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      apiFetch<{ items: EditorCustomer[] }>(`/api/customers?limit=8&q=${encodeURIComponent(q)}`)
        .then((r) => setItems(r.items))
        .catch(() => setItems([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  if (customer) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-md border border-line bg-surface-2 p-3">
        <div className="min-w-0 text-sm">
          <Link href={`/app/clients/${customer.id}`} className="font-medium hover:underline">
            {customerName(customer)}
          </Link>
          <div className="text-muted">
            {[customer.billing_line1, [customer.billing_postal_code, customer.billing_city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || (
              <span className="text-danger">Adresse manquante</span>
            )}
          </div>
          <div className="text-muted">{[customer.email, customer.phone].filter(Boolean).join(" - ")}</div>
        </div>
        <button type="button" className="link shrink-0 text-sm" onClick={onClear}>
          Changer
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Rechercher un client (nom, ville, e-mail)"
        className="field pl-9"
        aria-label="Rechercher un client"
      />
      {open ? (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-lg">
          {items.length === 0 ? <li className="px-3 py-2 text-sm text-muted">Aucun client trouvé</li> : null}
          {items.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOpen(false);
                  onPick(c.id);
                }}
              >
                <span className="font-medium">{customerName(c)}</span>
                <span className="block text-xs text-muted">{[c.billing_postal_code, c.billing_city, c.email].filter(Boolean).join(" - ")}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function IssueDialog({
  open,
  onClose,
  quoteId,
  revision,
  blocking,
  estimated,
  customer,
  ttc,
  isRevision,
  onIssued,
}: {
  open: boolean;
  onClose: () => void;
  quoteId: string;
  revision: React.RefObject<number>;
  blocking: string[];
  estimated: number;
  customer: string;
  ttc: number;
  isRevision: boolean;
  onIssued: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const issue = async () => {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/quotes/${quoteId}/issue`, { method: "POST", json: { confirm: true, draftRevision: revision.current } });
      onClose();
      onIssued();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Émission impossible");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={isRevision ? "Émettre la nouvelle version" : "Émettre le devis"}>
      {blocking.length ? (
        <div className="space-y-3 text-sm">
          <p>Le devis ne peut pas encore être émis :</p>
          <ul className="list-disc space-y-1 pl-5 text-danger">
            {blocking.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <div className="flex justify-end">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Compléter le devis
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <p>
            Le devis pour <strong>{customer}</strong>, d'un montant de <strong className="tabular">{formatEuros(ttc)} TTC</strong>, va recevoir un
            numéro définitif et un PDF figé. Il ne pourra plus être modifié : toute correction créera une nouvelle version.
          </p>
          {estimated ? (
            <p className="rounded-md bg-warning-soft p-3">
              {estimated} ligne(s) contiennent encore une estimation. Vérifiez-les ou marquez-les comme vérifiées.
            </p>
          ) : null}
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            J'ai vérifié les quantités, les prix, les taux de TVA et les informations du client.
          </label>
          {error ? (
            <p className="text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="button" className="btn-primary" disabled={!checked || busy} onClick={issue}>
              {busy ? "Émission..." : "Émettre"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Frais de déplacement calculés avec le barème de l'entreprise. */
function TravelForm({ travel, onAdd, onCancel }: { travel: TravelSettings; onAdd: (km: number, trips: number) => void; onCancel: () => void }) {
  const [km, setKm] = useState("");
  const [trips, setTrips] = useState("1");
  const k = Number(km.replace(",", "."));
  const n = Number(trips);
  const valid = Number.isFinite(k) && k >= 0 && k <= 1000 && km.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= 500;
  return (
    <div className="mt-3 flex flex-wrap items-end gap-3 rounded-md bg-surface-2 p-3 text-sm">
      <div>
        <label className="label" htmlFor="tr-km">
          Distance du chantier (km, aller)
        </label>
        <input id="tr-km" className="field-sm tabular w-32" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="tr-n">
          Nombre de déplacements
        </label>
        <input id="tr-n" className="field-sm tabular w-24" inputMode="numeric" value={trips} onChange={(e) => setTrips(e.target.value)} />
      </div>
      <p className="tabular pb-1.5 text-muted">
        {valid ? `${formatEuros(travelCostCents(travel, k))} HT par déplacement, ${formatEuros(travelCostCents(travel, k) * n)} HT au total` : ""}
      </p>
      <div className="ml-auto flex gap-2">
        <button type="button" className="btn-ghost min-h-9" onClick={onCancel}>
          Annuler
        </button>
        <button type="button" className="btn-primary min-h-9" disabled={!valid} onClick={() => onAdd(k, n)}>
          Ajouter la ligne
        </button>
      </div>
    </div>
  );
}
