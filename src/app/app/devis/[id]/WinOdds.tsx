import type { Ctx } from "@/lib/services/context";
import { quoteWinOdds } from "@/lib/services/win-odds";
import { MIN_HISTORY } from "@/lib/win-odds";

const pct = (v: number) => `${Math.round(v * 100)} %`;

/** Chance de signature estimée avant l'envoi, avec ce qui la fait monter ou baisser. */
export async function WinOdds({ ctx, quoteId }: { ctx: Ctx; quoteId: string }) {
  const r = await quoteWinOdds(ctx, quoteId);
  if (!["draft", "incomplete", "ready", "sent", "viewed"].includes(r.status)) return null;
  const o = r.odds;
  const tips = o ? o.factors.filter((f) => f.tip) : [];
  return (
    <section className="card mt-6 space-y-3 p-4 text-sm" data-testid="chance-signature">
      <div>
        <h2 className="text-sm font-semibold">Chance de signature</h2>
        <p className="text-xs text-muted">
          {o
            ? `Estimée sur vos ${o.history} derniers devis acceptés, refusés ou expirés, dont ${pct(o.baseRate)} signés en moyenne.`
            : `L'estimation apparaît dès ${MIN_HISTORY} devis acceptés, refusés ou expirés (${r.decided} pour l'instant).`}
        </p>
      </div>
      {o ? (
        <>
          <p className="text-3xl font-semibold tabular-nums">{pct(o.probability)}</p>
          <ul className="space-y-1">
            {o.factors.map((f) => (
              <li key={f.feature} className="flex flex-wrap justify-between gap-2">
                <span>{f.label}</span>
                <span className={`tabular-nums ${f.effect > 0.15 ? "text-success" : f.effect < -0.15 ? "text-danger" : "text-muted"}`}>
                  {pct(f.rate)} signés
                </span>
              </li>
            ))}
          </ul>
          {tips.length ? (
            <ul className="list-disc space-y-1 pl-5 text-muted">
              {tips.map((f) => (
                <li key={f.feature}>{f.tip}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
