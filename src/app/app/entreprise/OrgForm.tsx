"use client";

import { rulesFor } from "@/lib/country-rules";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { saveOrganizationAction, type ActionState } from "@/app/actions";

type V = Record<string, string | boolean | number | null>;

interface FieldDef {
  k: string;
  label: string;
  type?: "text" | "textarea" | "checkbox" | "select" | "image" | "color" | "number" | "vat";
  hint?: string;
  options?: [string, string][];
  wide?: boolean;
  rows?: number;
}

const TABS: { key: string; label: string; fields: FieldDef[] }[] = [
  {
    key: "identite",
    label: "Identité",
    fields: [
      { k: "trade_name", label: "Nom commercial" },
      { k: "legal_name", label: "Raison sociale" },
      { k: "legal_form", label: "Forme juridique", hint: "Ex. : SARL, SAS, EI, micro-entreprise" },
      { k: "share_capital", label: "Capital social" },
      { k: "siren", label: "SIREN" },
      { k: "siret", label: "SIRET" },
      { k: "rcs_rm", label: "Immatriculation RCS ou RM", hint: "Ex. : RCS Lyon 732 829 320 ou RM 69" },
      { k: "vat_number", label: "N° TVA intracommunautaire" },
      { k: "trade", label: "Métier principal", hint: "Sert aux contrôles avant émission (assurance décennale)" },
      {
        k: "country",
        label: "Pays d'établissement",
        type: "select",
        options: [
          ["France", "France"],
          ["Belgique", "Belgique"],
          ["Suisse", "Suisse"],
          ["Luxembourg", "Luxembourg"],
        ],
        hint: "Adapte les taux de TVA, l'identifiant d'entreprise et les contrôles",
      },
      { k: "address_line1", label: "Adresse", wide: true },
      { k: "address_line2", label: "Complément d'adresse", wide: true },
      { k: "postal_code", label: "Code postal" },
      { k: "city", label: "Ville" },
      { k: "phone", label: "Téléphone" },
      { k: "email", label: "E-mail professionnel", hint: "Reçoit les notifications d'acceptation" },
      { k: "website", label: "Site internet" },
    ],
  },
  {
    key: "assurance",
    label: "Assurance",
    fields: [
      { k: "insurance_decennale", label: "Je suis couvert par une assurance décennale", type: "checkbox", wide: true },
      { k: "insurance_name", label: "Assureur" },
      { k: "insurance_policy", label: "Numéro de contrat" },
      { k: "insurance_area", label: "Couverture géographique", hint: "Ex. : France métropolitaine" },
      { k: "insurance_coverage", label: "Activités et garanties couvertes", type: "textarea", wide: true, rows: 2 },
    ],
  },
  {
    key: "devis",
    label: "Devis",
    fields: [
      {
        k: "vat_regime",
        label: "Régime de TVA",
        type: "select",
        options: [
          ["normal", "Assujetti à la TVA"],
          ["franchise", "Franchise en base (pas de TVA)"],
        ],
      },
      { k: "default_vat_bp", label: "TVA par défaut des nouvelles lignes", type: "vat" },
      { k: "quote_prefix", label: "Préfixe de numérotation", hint: "Numéros au format PREFIXE-ANNÉE-0001" },
      { k: "default_validity_days", label: "Validité par défaut (jours)", type: "number" },
      { k: "default_deposit_percent", label: "Acompte par défaut (%)" },
      { k: "hourly_rate", label: "Taux horaire et décompte du temps", hint: "Ex. : 45 € HT de l'heure, temps décompté par demi-heure" },
      { k: "travel_fee", label: "Frais de déplacement", hint: "Ex. : forfait de 35 € HT par intervention" },
      {
        k: "mediator_name",
        label: "Médiateur de la consommation",
        hint: "Obligatoire pour les clients particuliers. Ex. : nom de l'organisme de médiation de votre fédération",
      },
      { k: "mediator_url", label: "Site du médiateur", hint: "Adresse du site où le client peut déposer sa demande" },
      { k: "payment_terms", label: "Conditions de paiement par défaut", type: "textarea", wide: true, rows: 2 },
      { k: "general_conditions", label: "Conditions générales imprimées sur le devis", type: "textarea", wide: true, rows: 6 },
    ],
  },
  {
    key: "apparence",
    label: "Apparence",
    fields: [
      { k: "logo_data", label: "Logo", type: "image" },
      { k: "signature_data", label: "Signature ou cachet", type: "image" },
      {
        k: "quote_template",
        label: "Modèle de PDF",
        type: "select",
        options: [
          ["classique", "Classique"],
          ["moderne", "Moderne"],
          ["sobre", "Sobre"],
        ],
      },
      { k: "accent_color", label: "Couleur principale", type: "color" },
      {
        k: "pdf_font",
        label: "Police du PDF",
        type: "select",
        options: [
          ["helvetica", "Helvetica (sans empattement)"],
          ["times", "Times (avec empattement)"],
        ],
      },
      {
        k: "default_pdf_layout",
        label: "Mise en page des nouveaux devis",
        type: "select",
        options: [
          ["detaille", "Détaillée"],
          ["synthese", "Récapitulatif en tête"],
          ["lots", "Un lot par page"],
        ],
      },
      {
        k: "pdf_footer_note",
        label: "Mention en pied de page",
        wide: true,
        hint: "Imprimée en bas de chaque page. Ex. : Artisan certifié RGE Qualibat, membre de la Capeb",
      },
    ],
  },
  {
    key: "paiement",
    label: "Banque",
    fields: [
      { k: "bank_holder", label: "Titulaire du compte" },
      { k: "bank_iban", label: "IBAN" },
      { k: "bank_bic", label: "BIC" },
    ],
  },
  {
    key: "emails",
    label: "E-mails",
    fields: [
      { k: "mail_subject_template", label: "Objet de l'e-mail d'envoi", wide: true },
      {
        k: "mail_body_template",
        label: "Message d'envoi",
        type: "textarea",
        wide: true,
        rows: 8,
        hint: "Variables : {client}, {numero}, {objet}, {total_ttc}, {total_ht}, {validite}, {entreprise}, {lien}",
      },
    ],
  },
];

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error("Format accepté : PNG, JPEG ou WebP"));
    if (file.size > 300_000) return reject(new Error("Image trop lourde (300 Ko maximum)"));
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Lecture impossible"));
    r.readAsDataURL(file);
  });
}

export function OrgForm({ tab, initial, canEdit }: { tab: string; initial: V; canEdit: boolean }) {
  const router = useRouter();
  const def = TABS.find((t) => t.key === tab) ?? TABS[0];
  const [v, setV] = useState<V>(initial);
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  const set = (k: string, val: V[string]) => setV((o) => ({ ...o, [k]: val }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: V = {};
    for (const f of def.fields) {
      let val = v[f.k];
      if (f.type === "number") val = Number(val) || 0;
      if (f.type === "vat") val = Number(val);
      if (f.type === "image") val = (val as string) || "";
      payload[f.k] = val;
    }
    start(async () => {
      const r = await saveOrganizationAction(payload);
      setState(r);
      if (r?.ok) router.refresh();
    });
  };

  const err = (k: string) => state?.fieldErrors?.[k];

  return (
    <form onSubmit={submit} className="card space-y-4 p-5">
      <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
        {def.fields.map((raw) => {
          const rules = rulesFor(String(v.country ?? ""));
          if (raw.k === "siret" && rules.code !== "FR") return null;
          const f =
            rules.code === "FR"
              ? raw
              : raw.k === "siren"
                ? { ...raw, label: rules.companyIdLabel, hint: rules.companyIdHint }
                : raw.k === "vat_number"
                  ? { ...raw, label: "Numéro de TVA", hint: rules.vatHint }
                  : raw;
          const id = `o-${f.k}`;
          const val = v[f.k];
          const cls = f.wide || f.type === "textarea" ? "sm:col-span-2" : "";
          if (f.type === "checkbox") {
            return (
              <label key={f.k} className={`flex items-center gap-2 text-sm ${cls}`}>
                <input type="checkbox" className="h-4 w-4" checked={!!val} onChange={(e) => set(f.k, e.target.checked)} />
                {f.label}
              </label>
            );
          }
          return (
            <div key={f.k} className={cls}>
              <label className="label" htmlFor={id}>
                {f.label}
              </label>
              {f.type === "textarea" ? (
                <textarea id={id} rows={f.rows ?? 3} className="field" value={String(val ?? "")} onChange={(e) => set(f.k, e.target.value)} />
              ) : f.type === "select" ? (
                <select id={id} className="field" value={String(val ?? "")} onChange={(e) => set(f.k, e.target.value)}>
                  {f.options!.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              ) : f.type === "vat" ? (
                <select id={id} className="field" value={String(val ?? 2000)} onChange={(e) => set(f.k, Number(e.target.value))}>
                  {rulesFor(String(v.country ?? ""))
                    .vatRatesBp.filter((bp) => bp !== 210)
                    .map((k) => [k, `${(k / 100).toLocaleString("fr-FR")} %`])
                    .map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                </select>
              ) : f.type === "color" ? (
                <div className="flex items-center gap-2">
                  <input
                    id={id}
                    type="color"
                    className="h-10 w-14 rounded border border-line"
                    value={String(val || "#1f4e79")}
                    onChange={(e) => set(f.k, e.target.value)}
                  />
                  <span className="text-sm text-muted">{String(val || "#1f4e79")}</span>
                </div>
              ) : f.type === "image" ? (
                <div className="flex items-center gap-3">
                  <div className="flex h-16 w-32 items-center justify-center rounded border border-line bg-white">
                    {val ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={String(val)} alt="" className="max-h-14 max-w-28 object-contain" />
                    ) : (
                      <Icon name="upload" className="text-muted" />
                    )}
                  </div>
                  <div className="space-y-1 text-sm">
                    <label className="link cursor-pointer">
                      Choisir une image
                      <input
                        id={id}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            set(f.k, await readImage(file));
                          } catch (x) {
                            setState({ error: (x as Error).message });
                          }
                        }}
                      />
                    </label>
                    {val ? (
                      <button type="button" className="block text-danger hover:underline" onClick={() => set(f.k, "")}>
                        Retirer
                      </button>
                    ) : null}
                    <p className="text-xs text-muted">PNG, JPEG ou WebP, 300 Ko maximum</p>
                  </div>
                </div>
              ) : (
                <input
                  id={id}
                  type={f.type === "number" ? "number" : "text"}
                  className="field"
                  value={String(val ?? "")}
                  onChange={(e) => set(f.k, e.target.value)}
                />
              )}
              {err(f.k) ? <p className="mt-1 text-sm text-danger">{err(f.k)}</p> : f.hint ? <p className="mt-1 text-xs text-muted">{f.hint}</p> : null}
            </div>
          );
        })}
      </fieldset>
      {state?.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? <p className="text-sm text-success">{state.message} Les devis déjà émis ne sont pas modifiés.</p> : null}
      {canEdit ? (
        <div className="flex justify-end">
          <button className="btn-primary" disabled={pending}>
            {pending ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted">Seuls le propriétaire et les administrateurs peuvent modifier le profil de l'entreprise.</p>
      )}
    </form>
  );
}
