import Link from "next/link";
import { formatEuros } from "@/lib/calc/format";
import type { Ctx } from "@/lib/services/context";
import { REFUSAL_REASONS } from "@/lib/services/refusal";
import { similarQuotes } from "@/lib/services/similar-quotes";

const pct = (bp: number) => `${bp > 0 ? "+" : ""}${Math.round(bp / 100)} %`;

/** Devis gagnés ou perdus qui ressemblent à celui-ci, et prix unitaires comparés. */
export async function SimilarQuotes({ ctx, quoteId }: { ctx: Ctx; quoteId: string }) {
  const r = await similarQuotes(ctx, quoteId);
  return (
    <section className="card mt-6 space-y-3 p-4 text-sm" data-testid="devis-similaires">
      <div>
        <h2 className="text-sm font-semibold">Devis similaires</h2>
        <p className="text-xs text-muted">
          {r.quotes.length
            ? `${r.won} gagné${r.won > 1 ? "s" : ""} et ${r.lost} perdu${r.lost > 1 ? "s" : ""} parmi vos devis proches de celui-ci (mêmes travaux, montant voisin).`
            : "Aucun devis accepté ou refusé ne ressemble encore à celui-ci."}
        </p>
      </div>
      {r.quotes.length ? (
        <ul className="divide-y divide-line">
          {r.quotes.map((q) => (
            <li key={q.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
              <div className="min-w-0">
                <Link className="link font-medium" href={`/app/devis/${q.id}`}>
                  {q.number ? `${q.number}, ` : ""}
                  {q.title || "Sans titre"}
                </Link>
                <p className="text-xs text-muted">
                  {q.customer ? `${q.customer}, ` : ""}
                  ressemblance {Math.round(q.similarity * 100)} %
                </p>
              </div>
              <div className="text-right">
                <p className={`text-xs font-medium ${q.won ? "text-success" : "text-danger"}`}>
                  {q.won
                    ? "Gagné"
                    : q.status === "expired"
                      ? "Perdu : sans réponse"
                      : `Perdu${q.reason ? ` : ${(REFUSAL_REASONS as Record<string, string>)[q.reason] ?? q.reason}` : ""}`}
                </p>
                <p className="tabular">{formatEuros(q.totalCents)} HT</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {r.prices.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" data-testid="prix-compares">
            <caption className="sr-only">Prix unitaires comparés aux devis similaires</caption>
            <thead className="text-muted">
              <tr>
                <th scope="col" className="py-1 pr-2 font-medium">
                  Ligne
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-medium">
                  Ce devis
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-medium">
                  Devis gagnés
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Devis perdus
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.prices.map((p) => (
                <tr key={`${p.label}|${p.unit}`}>
                  <td className="py-1 pr-2">
                    {p.label} <span className="text-muted">/ {p.unit}</span>
                  </td>
                  <td className="py-1 pr-2 text-right tabular">
                    {formatEuros(p.priceCents)}
                    {p.gapBp != null && Math.abs(p.gapBp) >= 500 ? (
                      <span className={`block ${p.gapBp > 0 ? "text-warning" : "text-muted"}`}>{pct(p.gapBp)} sur les gagnés</span>
                    ) : null}
                  </td>
                  <td className="py-1 pr-2 text-right tabular">{p.wonCents != null ? formatEuros(p.wonCents) : "-"}</td>
                  <td className="py-1 text-right tabular">{p.lostCents != null ? formatEuros(p.lostCents) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-muted">Prix médians des mêmes lignes dans les devis similaires.</p>
        </div>
      ) : null}
    </section>
  );
}
