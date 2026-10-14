"use client";

import { createReferralCodeAction, rewardReferralAction, saveReferralSettingsAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";

export function ReferralSettingsForm({ enabled, referrerReward, refereeReward }: { enabled: boolean; referrerReward: string; refereeReward: string }) {
  return (
    <ActionForm action={saveReferralSettingsAction} className="space-y-3">
      <label className="flex min-h-6 items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" value="1" defaultChecked={enabled} className="h-4 w-4" />
        Programme de parrainage actif
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="ref-referrer">
            Récompense du client parrain
          </label>
          <input id="ref-referrer" name="referrerReward" className="field" maxLength={200} defaultValue={referrerReward} required />
        </div>
        <div>
          <label className="label" htmlFor="ref-referee">
            Avantage du nouveau client
          </label>
          <input id="ref-referee" name="refereeReward" className="field" maxLength={200} defaultValue={refereeReward} />
        </div>
      </div>
      <Submit className="btn-secondary">Enregistrer le programme</Submit>
    </ActionForm>
  );
}

export function RewardButton({ leadId }: { leadId: string }) {
  return (
    <ActionForm action={rewardReferralAction} className="inline">
      <input type="hidden" name="leadId" value={leadId} />
      <Submit className="btn-secondary min-h-6 text-xs">Récompense remise</Submit>
    </ActionForm>
  );
}

export function CreateReferralCode({ customerId }: { customerId: string }) {
  return (
    <ActionForm action={createReferralCodeAction}>
      <input type="hidden" name="customerId" value={customerId} />
      <Submit className="btn-secondary">Créer le lien de parrainage</Submit>
    </ActionForm>
  );
}
