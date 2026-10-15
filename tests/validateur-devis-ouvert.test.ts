import { describe, expect, it } from "vitest";
import { validateExchange } from "@/lib/quote-exchange";

const doc = (patch: Record<string, unknown> = {}) => ({
  format: "devis-ouvert",
  version: "1.0",
  document: {
    number: "D-1",
    seller: { name: "Carrelage Martin" },
    sections: [
      {
        title: "Sol",
        lines: [
          { label: "Pose", quantity: "10", unitPrice: "40", vatRate: "10" },
          { label: "Plinthes", quantity: "5", unitPrice: "12", vatRate: "10" },
        ],
      },
    ],
    totals: { totalHt: "460.00", totalVat: "46.00", totalTtc: "506.00" },
    ...patch,
  },
});

describe("validateur public Devis ouvert", () => {
  it("valide un fichier conforme et le résume", () => {
    const r = validateExchange(doc());
    expect(r).toMatchObject({ valid: true, errors: [], warnings: [] });
    expect(r.summary).toEqual({ number: "D-1", seller: "Carrelage Martin", sections: 1, lines: 2, totalHt: "460.00", totalTtc: "506.00" });
  });

  it("signale les totaux qui ne correspondent pas aux lignes", () => {
    const r = validateExchange(doc({ totals: { totalHt: "500.00", totalVat: "50.00", totalTtc: "550.00" } }));
    expect(r.valid).toBe(true);
    expect(r.warnings[0]).toMatch(/460.00 HT/);
  });

  it("liste toutes les erreurs avec le champ concerné, pas seulement la première", () => {
    const r = validateExchange(
      doc({
        sections: [{ lines: [{ label: "Pose", quantity: "2,5", unitPrice: "abc", vatRate: "10" }] }],
        totals: { totalHt: "x", totalVat: "0", totalTtc: "0" },
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.summary).toBeNull();
    expect(r.errors.length).toBeGreaterThanOrEqual(3);
    expect(r.errors.some((e) => e.startsWith("document.sections.0.lines.0.quantity"))).toBe(true);
    expect(r.errors.some((e) => e.startsWith("document.sections.0.lines.0.unitPrice"))).toBe(true);
    expect(r.errors.some((e) => e.startsWith("document.totals.totalHt"))).toBe(true);
    expect(validateExchange({ format: "autre" }).errors[0]).toMatch(/Devis ouvert/);
    const many = validateExchange(
      doc({ sections: [{ lines: Array.from({ length: 30 }, () => ({ label: "", quantity: "x", unitPrice: "1", vatRate: "1" })) }] }),
    );
    expect(many.errors).toHaveLength(21);
    expect(many.errors[20]).toMatch(/^Et \d+ autres erreurs\.$/);
  });
});
