import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Notice, Section, fmtDate } from "@/components/ui";
import { BENEFITS } from "@/lib/preferential-pricing";
import type { PricingBenefit } from "@/lib/services/pricing-benefits";
import { benefitRequestAction } from "@/app/actions";

const STATUS = { en_attente: "En cours de vérification", accorde: "Accordé", refuse: "Refusé" } as const;

/** Tarifs apprentis et créateurs : état de la demande et formulaires. */
export function Benefits({ benefit, percent, owner }: { benefit: PricingBenefit | null; percent: number; owner: boolean }) {
  return (
    <Section title="Tarifs préférentiels">
      <div className="space-y-4" data-testid="tarifs-preferentiels">
        {benefit ? (
          <Notice
            tone={percent > 0 ? "success" : benefit.status === "refuse" ? "warning" : "info"}
            title={`${BENEFITS[benefit.kind].label} : ${STATUS[benefit.status]}`}
          >
            {percent > 0
              ? `Remise de ${percent} % appliquée à chaque échéance jusqu'au ${fmtDate(benefit.validUntil)}.`
              : benefit.status === "en_attente"
                ? `Demande du ${fmtDate(benefit.requestedAt)}. L'équipe vérifie l'éligibilité et répond sous deux jours ouvrés.`
                : benefit.status === "refuse"
                  ? `Motif : ${benefit.decisionNote}`
                  : `Le tarif a pris fin le ${fmtDate(benefit.validUntil)}.`}
          </Notice>
        ) : null}
        {percent > 0 || benefit?.status === "en_attente" ? null : !owner ? (
          <p className="text-sm text-muted">Seul le propriétaire du compte peut demander un tarif préférentiel.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded border border-line p-4">
              <h3 className="font-semibold">{BENEFITS.apprenti.label}</h3>
              <p className="mb-3 text-sm text-muted">
                {BENEFITS.apprenti.summary} Justificatif : {BENEFITS.apprenti.proof.toLowerCase()}.
              </p>
              <ActionForm action={benefitRequestAction} className="space-y-3 text-sm">
                <input type="hidden" name="kind" value="apprenti" />
                <div>
                  <label className="label" htmlFor="b-school">
                    Établissement de formation
                  </label>
                  <input id="b-school" name="school" className="field" placeholder="Ex. CFA du bâtiment de Lyon" required />
                </div>
                <div>
                  <label className="label" htmlFor="b-diploma">
                    Diplôme préparé
                  </label>
                  <input id="b-diploma" name="diploma" className="field" placeholder="Ex. CAP maçon" required />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="b-end">
                      Fin de la formation
                    </label>
                    <input id="b-end" name="trainingEnd" type="date" className="field" required />
                  </div>
                  <div>
                    <label className="label" htmlFor="b-ref">
                      N° de contrat ou INE
                    </label>
                    <input id="b-ref" name="reference" className="field" required />
                  </div>
                </div>
                <Submit>Demander le tarif apprenti</Submit>
              </ActionForm>
            </div>
            <div className="rounded border border-line p-4">
              <h3 className="font-semibold">{BENEFITS.createur.label}</h3>
              <p className="mb-3 text-sm text-muted">
                {BENEFITS.createur.summary} Justificatif : {BENEFITS.createur.proof.toLowerCase()}.
              </p>
              <ActionForm action={benefitRequestAction} className="space-y-3 text-sm">
                <input type="hidden" name="kind" value="createur" />
                <div>
                  <label className="label" htmlFor="b-creation">
                    Date de création de l&apos;entreprise
                  </label>
                  <input id="b-creation" name="creationDate" type="date" className="field" required />
                </div>
                <Submit>Demander le tarif créateur</Submit>
              </ActionForm>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
