import { decideSubQuoteAction, integrateSubQuoteAction, recordSubQuoteAction, requestSubQuoteAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { formatEuros } from "@/lib/calc/format";
import { SUB_QUOTE_STATUSES, type SubQuote } from "@/lib/services/subcontractor-quotes";

const TONES: Record<SubQuote["status"], string> = {
  demande: "text-muted",
  recu: "text-accent",
  retenu: "text-success",
  refuse: "text-muted",
  annule: "text-muted",
};

/**
 * Demandes de prix aux sous-traitants : formulaire de demande, réponses reçues, saisie d'un prix reçu
 * autrement, intégration au devis client avec la marge, ou mise à l'écart.
 */
export function SubQuotes({
  rows,
  back,
  canEdit,
  fixedQuoteId,
  fixedSubId,
  subcontractors = [],
  draftQuotes = [],
}: {
  rows: SubQuote[];
  back: string;
  canEdit: boolean;
  fixedQuoteId?: string;
  fixedSubId?: string;
  subcontractors?: { id: string; name: string; email: string }[];
  draftQuotes?: { id: string; label: string }[];
}) {
  return (
    <div className="space-y-4 text-sm">
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border border-line p-3" data-testid="demande-st">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{r.title}</p>
                  <p className="text-xs text-muted">
                    {fixedSubId
                      ? r.quote_id
                        ? `Devis ${r.quote_number ?? "brouillon"} ${r.quote_title}`
                        : "Sans devis rattaché"
                      : r.subcontractor_name}
                  </p>
                </div>
                <span className={`text-xs font-medium ${TONES[r.status]}`}>{SUB_QUOTE_STATUSES[r.status]}</span>
              </div>
              {r.amount_ht_cents != null ? (
                <p className="mt-2">
                  <span className="tabular font-semibold">{formatEuros(r.amount_ht_cents)} HT</span>
                  {r.delay ? ` · délai : ${r.delay}` : ""}
                  {r.answered_by ? <span className="text-muted"> · {r.answered_by}</span> : null}
                  {r.has_file ? (
                    <>
                      {" "}
                      ·{" "}
                      <a className="link" href={`/api/subcontractor-quotes/${r.id}/file`} target="_blank" rel="noreferrer">
                        Devis joint
                      </a>
                    </>
                  ) : null}
                </p>
              ) : null}
              {r.answer_note ? <p className="mt-1 whitespace-pre-wrap text-muted">{r.answer_note}</p> : null}
              {r.status === "retenu" && r.margin_bp != null ? (
                <p className="mt-1 text-xs text-muted">Intégré au devis avec une marge de {r.margin_bp / 100} %.</p>
              ) : null}
              {canEdit && (r.status === "demande" || r.status === "recu") ? (
                <div className="mt-3 space-y-3">
                  {r.status === "recu" && (r.quote_id || draftQuotes.length) ? (
                    <ActionForm action={integrateSubQuoteAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      {r.quote_id ? (
                        <input type="hidden" name="quoteId" value={r.quote_id} />
                      ) : (
                        <div>
                          <label className="label" htmlFor={`sq-q-${r.id}`}>
                            Devis client
                          </label>
                          <select id={`sq-q-${r.id}`} name="quoteId" className="field" required>
                            {draftQuotes.map((q) => (
                              <option key={q.id} value={q.id}>
                                {q.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="label" htmlFor={`sq-m-${r.id}`}>
                          Marge (%)
                        </label>
                        <input id={`sq-m-${r.id}`} name="margin" className="field w-24" inputMode="decimal" defaultValue="15" />
                      </div>
                      <Submit className="btn-primary min-h-9" pendingLabel="...">
                        <Icon name="plus" size={16} /> Intégrer au devis
                      </Submit>
                    </ActionForm>
                  ) : null}
                  <details>
                    <summary className="cursor-pointer text-xs text-muted">
                      {r.status === "recu" ? "Corriger le prix" : "Saisir un prix reçu par téléphone ou e-mail"}
                    </summary>
                    <ActionForm action={recordSubQuoteAction} className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="back" value={back} />
                      <div>
                        <label className="label" htmlFor={`sq-a-${r.id}`}>
                          Montant HT
                        </label>
                        <input id={`sq-a-${r.id}`} name="amount" className="field w-32" inputMode="decimal" required />
                      </div>
                      <div>
                        <label className="label" htmlFor={`sq-d-${r.id}`}>
                          Délai
                        </label>
                        <input id={`sq-d-${r.id}`} name="delay" className="field w-40" maxLength={200} />
                      </div>
                      <Submit className="btn-secondary min-h-9" pendingLabel="...">
                        Enregistrer
                      </Submit>
                    </ActionForm>
                  </details>
                  <ActionForm action={decideSubQuoteAction} className="space-y-2">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="back" value={back} />
                    <input type="hidden" name="decision" value={r.status === "recu" ? "refuse" : "annule"} />
                    <Submit className="btn-ghost min-h-9 text-xs" pendingLabel="...">
                      {r.status === "recu" ? "Écarter ce prix" : "Annuler la demande"}
                    </Submit>
                  </ActionForm>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">Aucune demande de prix pour l'instant.</p>
      )}
      {canEdit && (fixedSubId || subcontractors.length) ? (
        <div className="rounded-lg border border-dashed border-line p-3">
          <h3 className="font-medium">Demander un prix à un sous-traitant</h3>
          <ActionForm action={requestSubQuoteAction} className="mt-3 space-y-3" resetOnSuccess>
            {fixedSubId ? (
              <input type="hidden" name="subcontractorId" value={fixedSubId} />
            ) : (
              <div>
                <label className="label" htmlFor="sq-sub">
                  Sous-traitant
                </label>
                <select id="sq-sub" name="subcontractorId" className="field" required>
                  {subcontractors.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                      {x.email ? "" : " (sans e-mail)"}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {fixedQuoteId ? (
              <input type="hidden" name="quoteId" value={fixedQuoteId} />
            ) : draftQuotes.length ? (
              <div>
                <label className="label" htmlFor="sq-quote">
                  Pour le devis (facultatif)
                </label>
                <select id="sq-quote" name="quoteId" className="field">
                  <option value="">Aucun pour l'instant</option>
                  {draftQuotes.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div>
              <label className="label" htmlFor="sq-title">
                Travaux demandés
              </label>
              <input
                id="sq-title"
                name="title"
                className="field"
                required
                minLength={2}
                maxLength={200}
                placeholder="Mise aux normes du tableau électrique"
              />
            </div>
            <div>
              <label className="label" htmlFor="sq-desc">
                Précisions (facultatif)
              </label>
              <textarea id="sq-desc" name="description" className="field min-h-20" maxLength={4000} />
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="send" value="1" defaultChecked className="h-4 w-4" /> Envoyer la demande par e-mail
            </label>
            <Submit className="btn-secondary" pendingLabel="Envoi...">
              <Icon name="send" size={16} /> Demander un prix
            </Submit>
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}
