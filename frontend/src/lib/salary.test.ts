import { expect, test } from "vitest";
import { nextPayday, treasury } from "./salary";
import type { AppData, Recurrence, Transaction } from "./types";

test("prochaine paie = dernière paie + le plus long des 3 derniers écarts", () => {
  // Historique réel ALDI : 28/05, 26/06, 29/07, 28/08, 25/09 → écarts 33, 30, 28
  expect(nextPayday(["2026-05-28", "2026-06-26", "2026-07-29", "2026-08-28", "2026-09-25"])).toBe("2026-10-28");
  // Changement d'employeur : la paie passe du 28 au 5 → la prévision suit sans réglage
  expect(nextPayday(["2026-09-25", "2026-10-28", "2026-12-05"])).toBe("2027-01-12");
  expect(nextPayday(["2026-10-28"])).toBe("2026-11-28");
});

const tx = (date: string, amount: number, category: string, accountId = "main"): Transaction => ({
  id: date + amount, date, accountId, description: category, category, amount, currency: "EUR",
  type: amount > 0 ? "income" : "expense", internal: false, source: "manual", catStatus: "manual", createdAt: "",
});

test("report = disponible − échéances prévues − dépenses courantes jusqu'à la paie", () => {
  const rent: Recurrence = {
    id: "r", name: "Loyer", amount: 200, accountId: "main", category: "Loyer", type: "expense", frequency: "monthly",
    interval: 1, intervalUnit: "months", startDate: "2026-09-20", nextDate: "2026-10-20", endMode: "never", status: "active", occurrences: 1, cumulated: 200,
  };
  const data = {
    accounts: [
      { id: "main", name: "Principal", type: "main", currency: "EUR", openingBalance: 0, color: "", archived: false },
      { id: "sav", name: "Épargne", type: "savings", currency: "EUR", openingBalance: 5000, color: "", archived: false },
    ],
    transactions: [
      tx("2026-09-01", 2000, "Salaire"),
      tx("2026-09-15", -310, "Courses"),
      tx("2026-09-20", -200, "Loyer"), // échéance déjà connue : pas une dépense courante
      tx("2026-10-01", 2000, "Salaire"),
      tx("2026-10-05", -100, "Courses"),
    ],
    recurrences: [rent],
  } as unknown as AppData;

  const t = treasury(data, "2026-10-10")!;
  expect(t.nextPay).toBe("2026-10-31");
  expect(t.available).toBe(3390); // épargne exclue
  expect(t.planned).toBe(-200);
  expect(t.variable).toBe(217); // 310 € / 30 j × 21 j restants
  expect(t.carry).toBe(2973);
});
