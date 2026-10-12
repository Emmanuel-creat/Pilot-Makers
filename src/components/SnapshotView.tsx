import { formatEuros, formatPercent, formatQuantity, formatUnitPrice } from "@/lib/calc/format";
import type { QuoteSnapshot } from "@/lib/services/quote-types";

function frDate(isoDate: string) {
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Rendu HTML d'une version figée, identique au PDF dans son contenu. */
export function SnapshotView({
  s,
  heading,
  afterTotals,
}: {
  s: QuoteSnapshot;
  /** Titre et informations à la place de « Devis », pour une facture ou un avoir */
  heading?: { title: string; lines: string[] };
  afterTotals?: [string, string, boolean][];
}) {
  const lines = new Map(s.calc.sections.flatMap((sec) => sec.lines.map((l) => [l.id, l] as const)));
  const subtotals = new Map(s.calc.sections.map((sec) => [sec.id, sec.subtotalCents]));
  const exempt = s.org.vat_regime === "franchise" || s.quote.reverseCharge === true;
  return (
    <article className="card overflow-hidden">
      <header className="grid gap-6 border-b border-line p-5 sm:grid-cols-2 sm:p-8" style={{ borderTop: `4px solid ${s.accentColor || "#1f6feb"}` }}>
        <div className="text-sm">
          {s.org.logo_data ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.org.logo_data} alt="" className="mb-3 max-h-14 max-w-48 object-contain" />
          ) : null}
          <div className="text-base font-semibold">{s.org.trade_name}</div>
          {s.org.legal_name && s.org.legal_name !== s.org.trade_name ? <div>{s.org.legal_name}</div> : null}
          <div className="text-muted">
            {s.org.address_line1}
            {s.org.address_line2 ? <>, {s.org.address_line2}</> : null}
            <br />
            {s.org.postal_code} {s.org.city}
          </div>
          <div className="text-muted">{[s.org.phone, s.org.email].filter(Boolean).join(" - ")}</div>
          {s.org.siret ? <div className="text-muted">SIRET {s.org.siret}</div> : null}
        </div>
        <div className="text-sm sm:text-right">
          {heading ? (
            <>
              <div className="text-xl font-semibold">{heading.title}</div>
              <div className="text-muted">
                {heading.lines.filter(Boolean).map((l) => (
                  <div key={l}>{l}</div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="text-xl font-semibold">Devis {s.number}</div>
              <div className="text-muted">
                Version {s.version} du {frDate(s.issueDate)}
                <br />
                Valable jusqu'au {frDate(s.validUntil)}
              </div>
            </>
          )}
          <div className="mt-3 inline-block rounded-md border border-line p-3 text-left">
            <div className="text-xs text-muted">Client</div>
            <div className="font-medium">{s.customer.name}</div>
            {s.customer.contact && s.customer.contact !== s.customer.name ? <div>{s.customer.contact}</div> : null}
            <div className="text-muted">
              {s.customer.billing_line1}
              <br />
              {s.customer.billing_postal_code} {s.customer.billing_city}
            </div>
          </div>
        </div>
      </header>
      <div className="space-y-1 border-b border-line px-5 py-4 text-sm sm:px-8">
        <div>
          <span className="text-muted">Objet : </span>
          <strong>{s.quote.title}</strong>
        </div>
        <div>
          <span className="text-muted">Lieu des travaux : </span>
          {[s.quote.site.line1, s.quote.site.line2, `${s.quote.site.postalCode} ${s.quote.site.city}`].filter((x) => x.trim()).join(", ")}
        </div>
        {s.quote.description ? <p className="whitespace-pre-line text-muted">{s.quote.description}</p> : null}
        {s.quote.estimatedStart || s.quote.estimatedDuration ? (
          <div className="text-muted">
            {s.quote.estimatedStart ? `Début estimé : ${s.quote.estimatedStart}. ` : ""}
            {s.quote.estimatedDuration ? `Durée estimée : ${s.quote.estimatedDuration}.` : ""}
          </div>
        ) : null}
      </div>
      <div className="divide-y divide-line border-b border-line sm:hidden">
        {s.sections.map((sec) => (
          <div key={sec.id}>
            {sec.title ? <div className="bg-surface-2 px-5 py-2 text-sm font-semibold">{sec.title}</div> : null}
            <ul className="divide-y divide-line">
              {sec.lines.map((l) => {
                const r = lines.get(l.id);
                return (
                  <li key={l.id} className="px-5 py-3 text-sm">
                    {l.kind === "note" ? (
                      <span className="text-muted italic">{l.label}</span>
                    ) : (
                      <>
                        <div className="flex justify-between gap-3">
                          <span className="font-medium">{l.label}</span>
                          <span className="tabular font-medium whitespace-nowrap">{r ? formatEuros(r.netCents) : ""}</span>
                        </div>
                        {l.description ? <div className="whitespace-pre-line text-xs text-muted">{l.description}</div> : null}
                        <div className="tabular text-xs text-muted">
                          {r ? `${formatQuantity(r.quantityMilli)} ${l.unit} x ${formatUnitPrice(r.unitPrice4)}` : ""}
                          {r && r.discountBp ? `, remise ${formatPercent(r.discountBp)}` : ""}
                          {r && !exempt ? `, TVA ${formatPercent(r.vatBp)}` : ""}
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="table-head border-b border-line">
              <th className="px-5 py-2 text-left font-medium sm:px-8">Désignation</th>
              <th className="px-2 py-2 text-right font-medium">Qté</th>
              <th className="px-2 py-2 text-right font-medium">PU HT</th>
              {exempt ? null : <th className="px-2 py-2 text-right font-medium">TVA</th>}
              <th className="px-5 py-2 text-right font-medium sm:px-8">Total HT</th>
            </tr>
          </thead>
          {s.sections.map((sec) => (
            <tbody key={sec.id} className="border-b border-line">
              {sec.title ? (
                <tr>
                  <td colSpan={5} className="bg-surface-2 px-5 py-2 font-semibold sm:px-8">
                    {sec.title}
                  </td>
                </tr>
              ) : null}
              {sec.lines.map((l) => {
                const r = lines.get(l.id);
                if (l.kind === "note") {
                  return (
                    <tr key={l.id}>
                      <td colSpan={5} className="px-5 py-2 text-muted italic sm:px-8">
                        {l.label}
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={l.id} className="align-top">
                    <td className="px-5 py-2 sm:px-8">
                      <div className="font-medium">{l.label}</div>
                      {l.description ? <div className="whitespace-pre-line text-xs text-muted">{l.description}</div> : null}
                      {r && r.discountBp ? <div className="text-xs text-muted">Remise {formatPercent(r.discountBp)}</div> : null}
                    </td>
                    <td className="tabular px-2 py-2 text-right whitespace-nowrap">
                      {r ? formatQuantity(r.quantityMilli) : ""} {l.unit}
                    </td>
                    <td className="tabular px-2 py-2 text-right whitespace-nowrap">{r ? formatUnitPrice(r.unitPrice4) : ""}</td>
                    {exempt ? null : <td className="tabular px-2 py-2 text-right">{r ? formatPercent(r.vatBp) : ""}</td>}
                    <td className="tabular px-5 py-2 text-right whitespace-nowrap sm:px-8">{r ? formatEuros(r.netCents) : ""}</td>
                  </tr>
                );
              })}
              {sec.title && s.sections.length > 1 && sec.lines.some((l) => l.kind === "item") ? (
                <tr>
                  <td colSpan={exempt ? 3 : 4} className="px-5 py-1.5 text-right text-muted sm:px-8">
                    Sous-total {sec.title}
                  </td>
                  <td className="tabular px-5 py-1.5 text-right font-medium sm:px-8">{formatEuros(subtotals.get(sec.id) ?? 0)}</td>
                </tr>
              ) : null}
            </tbody>
          ))}
        </table>
      </div>
      <div className="grid gap-6 p-5 sm:grid-cols-[1fr_300px] sm:p-8">
        <div className="space-y-3 text-sm">
          {s.quote.paymentTerms && !heading ? (
            <div>
              <div className="font-medium">Conditions de paiement</div>
              <p className="whitespace-pre-line text-muted">{s.quote.paymentTerms}</p>
            </div>
          ) : null}
          {s.quote.specialConditions ? (
            <div>
              <div className="font-medium">Conditions particulières</div>
              <p className="whitespace-pre-line text-muted">{s.quote.specialConditions}</p>
            </div>
          ) : null}
          {s.mentions.length ? (
            <ul className="space-y-1 text-xs text-muted">
              {s.mentions.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <dl className="space-y-1.5 text-sm">
          {s.calc.globalDiscountCents ? (
            <>
              <div className="flex justify-between text-muted">
                <dt>Sous-total HT</dt>
                <dd className="tabular">{formatEuros(s.calc.subtotalCents)}</dd>
              </div>
              <div className="flex justify-between text-muted">
                <dt>Remise {formatPercent(s.calc.globalDiscountBp)}</dt>
                <dd className="tabular">-{formatEuros(s.calc.globalDiscountCents)}</dd>
              </div>
            </>
          ) : null}
          <div className="flex justify-between font-medium">
            <dt>Total HT</dt>
            <dd className="tabular">{formatEuros(s.calc.totalHtCents)}</dd>
          </div>
          {exempt ? (
            <p className="text-xs text-muted">
              {s.org.vat_regime === "franchise"
                ? "TVA non applicable, article 293 B du CGI"
                : "TVA autoliquidée par le client, article 283-2 nonies du CGI"}
            </p>
          ) : (
            s.calc.vatGroups.map((g) => (
              <div key={g.vatBp} className="flex justify-between text-muted">
                <dt>TVA {formatPercent(g.vatBp)}</dt>
                <dd className="tabular">{formatEuros(g.vatCents)}</dd>
              </div>
            ))
          )}
          <div className="flex justify-between border-t border-line pt-2 text-lg font-semibold">
            <dt>Total TTC</dt>
            <dd className="tabular">{formatEuros(s.calc.totalTtcCents)}</dd>
          </div>
          {afterTotals?.map(([label, value, bold]) => (
            <div key={label} className={`flex justify-between ${bold ? "font-semibold" : "text-muted"}`}>
              <dt>{label}</dt>
              <dd className="tabular">{value}</dd>
            </div>
          ))}
          {!heading && s.quote.depositPercent && s.quote.depositPercent !== "0" ? (
            <div className="flex justify-between text-muted">
              <dt>Acompte demandé</dt>
              <dd>{s.quote.depositPercent} %</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </article>
  );
}
