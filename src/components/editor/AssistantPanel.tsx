"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import type { DraftSection } from "@/lib/services/quote-types";
import { apiFetch, ApiError, uid } from "./api";

interface Proposal {
  summary: string;
  sections: DraftSection[];
  questions: string[];
  checklist: string[];
  warnings: string[];
  explanations?: Record<string, string>;
  trades?: { code: string; label: string }[];
  proposalId?: string;
  habitsApplied?: number;
  quality?: { lines: number; keptPercent: number | null };
}

/**
 * Assistant de préparation : propose des lignes à partir d'une description.
 * Rien n'est ajouté au devis sans un clic explicite de l'artisan.
 */
export function AssistantPanel({
  open,
  onClose,
  initialText,
  autoRun,
  onAdd,
  quoteId,
}: {
  quoteId: string;
  open: boolean;
  onClose: () => void;
  initialText: string;
  autoRun: boolean;
  onAdd: (sections: DraftSection[]) => void;
}) {
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const ran = useRef(false);

  const run = async (value = text) => {
    setBusy(true);
    setError("");
    try {
      const p = await apiFetch<Proposal>("/api/ai/quote-draft", { method: "POST", json: { text: value, quoteId } });
      setProposal(p);
      setExcluded([]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erreur inattendue");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (open && autoRun && !ran.current && initialText.trim().length >= 10) {
      ran.current = true;
      run(initialText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoRun]);

  const add = () => {
    if (!proposal) return;
    const sections = proposal.sections
      // Les lignes gardent leur identifiant : à l'émission, on mesure ce qui a été gardé tel quel.
      .map((s) => ({ ...s, id: uid(), lines: s.lines.filter((l) => !excluded.includes(l.id)) }))
      .filter((s) => s.lines.length);
    onAdd(sections);
    if (proposal.proposalId) {
      const lineIds = sections.flatMap((s) => s.lines.map((l) => l.id));
      // Mesure seulement : un échec ne doit pas gêner la saisie du devis.
      apiFetch(`/api/ai/proposals/${proposal.proposalId}`, { method: "POST", json: { quoteId, lineIds } }).catch(() => undefined);
    }
    setProposal(null);
    onClose();
  };

  const count = proposal ? proposal.sections.reduce((n, s) => n + s.lines.filter((l) => !excluded.includes(l.id)).length, 0) : 0;

  return (
    <Modal open={open} onClose={onClose} title="Assistant de préparation" wide>
      <p className="text-sm text-muted">
        Décrivez le chantier avec vos mots. L'assistant réutilise d'abord votre catalogue, signale les quantités estimées et pose les questions qui
        manquent. Vous vérifiez tout avant d'ajouter.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className="field mt-3"
        placeholder="Ex. : Rénovation d'une salle de bain de 6 m². Dépose de l'ancien carrelage, pose de carrelage au sol, faïence murale sur 14 m², remplacement du WC."
        aria-label="Description du chantier"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs text-muted">Les e-mails et numéros de téléphone sont masqués avant l'analyse.</span>
        <button type="button" className="btn-primary" onClick={() => run()} disabled={busy || text.trim().length < 10}>
          <Icon name="wand" size={16} />
          {busy ? "Analyse..." : proposal ? "Relancer" : "Proposer des lignes"}
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      {proposal ? (
        <div className="mt-5 space-y-4">
          {proposal.habitsApplied || (proposal.quality?.keptPercent ?? null) !== null ? (
            <p className="text-xs text-muted">
              {proposal.habitsApplied
                ? `${proposal.habitsApplied} ligne${proposal.habitsApplied > 1 ? "s" : ""} ajustée${proposal.habitsApplied > 1 ? "s" : ""} selon vos devis précédents (libellé, prix ou ordre). `
                : ""}
              {proposal.quality && proposal.quality.keptPercent !== null
                ? `Sur vos devis émis, ${proposal.quality.keptPercent} % des lignes proposées ont été gardées telles quelles (${proposal.quality.lines} ligne${proposal.quality.lines > 1 ? "s" : ""}).`
                : ""}
            </p>
          ) : null}
          {proposal.trades?.length ? (
            <p className="text-sm">
              <span className="text-muted">Métiers reconnus : </span>
              {proposal.trades.map((t) => t.label).join(", ")}
            </p>
          ) : null}
          {proposal.warnings.length ? (
            <ul className="space-y-1 rounded-md border border-warning/40 bg-warning-soft p-3 text-sm">
              {proposal.warnings.map((w) => (
                <li key={w} className="flex gap-2">
                  <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-warning" />
                  {w}
                </li>
              ))}
            </ul>
          ) : null}
          {proposal.sections.map((s) => (
            <div key={s.id}>
              <h3 className="text-sm font-semibold">{s.title}</h3>
              <ul className="mt-1 divide-y divide-line rounded-md border border-line">
                {s.lines.map((l) => (
                  <li key={l.id}>
                    <label className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4"
                        checked={!excluded.includes(l.id)}
                        onChange={() => setExcluded((x) => (x.includes(l.id) ? x.filter((i) => i !== l.id) : [...x, l.id]))}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{l.label}</span>
                        {l.kind === "pending" ? <span className="ml-2 text-xs text-warning">à compléter</span> : null}
                        {l.estimated ? <span className="block text-xs text-warning">Estimation : {l.estimateNote}</span> : null}
                        {proposal.explanations?.[l.id] ? <span className="block text-xs text-muted">{proposal.explanations[l.id]}</span> : null}
                      </span>
                      <span className="tabular shrink-0 text-right text-muted">
                        {l.quantity ? `${l.quantity} ${l.unit}` : "-"}
                        {l.unitPrice ? <span className="block">{l.unitPrice} €</span> : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold">Questions à poser au client</h3>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted">
                {proposal.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold">À vérifier avant d'émettre</h3>
              <ul className="mt-1 space-y-0.5 text-sm text-muted">
                {proposal.checklist.map((q) => (
                  <li key={q} className="flex gap-2">
                    <Icon name="check" size={14} className="mt-0.5 shrink-0" />
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-xs text-muted">Le taux de TVA n'est jamais choisi à votre place quand il dépend de la situation du client.</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Fermer
            </button>
            <button type="button" className="btn-primary" onClick={add} disabled={!count}>
              Ajouter {count} ligne{count > 1 ? "s" : ""} au devis
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
