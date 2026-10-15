import { describe, expect, it } from "vitest";
import { watchAlerts, watchDuration } from "@/lib/watch";

const q = (customer: string, viewed = false, expiresSoon = false) => ({ number: "D-1", customer, viewed, expiresSoon });

describe("écran montre", () => {
  it("rappelle de pointer, signale les devis lus et ceux qui expirent", () => {
    const alerts = watchAlerts(
      { quotes: [q("Mme Martin", true), q("SCI Les Tilleuls de la Grande Rue", true, true), q("M. Petit", false, true)], running: false, plannedJobs: 2 },
      5,
    );
    expect(alerts).toEqual(["Pas encore pointé (2 chantiers)", "Devis lu : Mme Martin", "Devis lu : SCI Les Tilleuls de la Gr.", "2 devis expirent bientôt"]);
    expect(alerts.every((a) => a.length <= 40)).toBe(true);
  });

  it("garde trois alertes au plus et se tait quand tout va bien", () => {
    expect(watchAlerts({ quotes: [q("A", true), q("B", true), q("C", true), q("D", true)], running: true, plannedJobs: 1 })).toHaveLength(3);
    expect(watchAlerts({ quotes: [], running: true, plannedJobs: 1 })).toEqual([]);
    expect(watchAlerts({ quotes: [q("A", false, true)], running: true, plannedJobs: 0 })).toEqual(["1 devis expire bientôt"]);
  });

  it("affiche une durée lisible", () => {
    expect(watchDuration(45.8)).toBe("45 min");
    expect(watchDuration(125)).toBe("2 h 05");
    expect(watchDuration(-3)).toBe("0 min");
  });
});
