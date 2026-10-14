import { CustomerRisk } from "@/components/CustomerRisk";
import type { Ctx } from "@/lib/services/context";
import { riskForQuote } from "@/lib/services/customer-risk";

export async function QuoteRisk({ ctx, quoteId }: { ctx: Ctx; quoteId: string }) {
  const r = await riskForQuote(ctx, quoteId);
  if (!r) return null;
  return (
    <CustomerRisk
      risk={r}
      note={r.depositTooLow ? `L'acompte du devis (${r.quoteDeposit} %) est inférieur aux ${r.depositPercent} % conseillés pour ce client.` : null}
    />
  );
}
