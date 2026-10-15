import { formatEuros } from "@/lib/calc/format";
import { priceBreakdown } from "@/lib/price-breakdown";
import type { QuoteSnapshot } from "@/lib/services/quote-types";

const fr = (n: number) => String(n).replace(".", ",");

/** Où va l'argent du client, poste par poste, tiré des seules lignes du devis. */
export function PriceBreakdown({ s }: { s: QuoteSnapshot }) {
  const b = priceBreakdown(s);
  if (!b) return null;
  return (
    <section className="card mt-4 p-5" aria-labelledby="ou-va-argent" data-testid="ou-va-argent">
      <h2 id="ou-va-argent" className="font-semibold">
        Où va votre argent
      </h2>
      <p className="mt-1 text-sm text-muted">Le prix hors taxes du devis, réparti selon la nature de chaque ligne.</p>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        {b.parts.map((p, i) => (
          <span key={p.key} className="h-full bg-accent" style={{ width: `${p.share}%`, opacity: 1 - i * 0.15 }} />
        ))}
      </div>
      <table className="mt-3 w-full text-sm">
        <caption className="sr-only">Répartition du prix du devis</caption>
        <tbody className="divide-y divide-line">
          {b.parts.map((p) => (
            <tr key={p.key}>
              <th scope="row" className="py-1.5 text-left font-normal">
                {p.label}
              </th>
              <td className="py-1.5 text-right tabular-nums text-muted">{p.share} %</td>
              <td className="py-1.5 text-right tabular-nums">{formatEuros(p.htCents)} HT</td>
            </tr>
          ))}
          {b.vatCents ? (
            <tr>
              <th scope="row" className="py-1.5 text-left font-normal">
                TVA reversée à l&apos;État
              </th>
              <td />
              <td className="py-1.5 text-right tabular-nums">{formatEuros(b.vatCents)}</td>
            </tr>
          ) : null}
          <tr className="font-semibold">
            <th scope="row" className="py-1.5 text-left">
              Total {b.vatCents ? "TTC" : ""}
            </th>
            <td />
            <td className="py-1.5 text-right tabular-nums">{formatEuros(b.totalTtcCents)}</td>
          </tr>
        </tbody>
      </table>
      {b.labour ? (
        <p className="mt-2 text-sm">
          Main-d&apos;œuvre comptée en heures : {fr(b.labour.hours)} h à {formatEuros(b.labour.hourlyHtCents)} HT de l&apos;heure. Ce prix couvre le salaire,
          les charges sociales, l&apos;assurance, l&apos;outillage et le véhicule de l&apos;entreprise.
        </p>
      ) : null}
    </section>
  );
}
