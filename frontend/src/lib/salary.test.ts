import { expect, test } from "vitest";
import { nextPayday } from "./salary";
import { cashflow } from "./cashflow";
import type { AppData, Transaction } from "./types";

test("prochaine paie = dernière paie + le plus long des 3 derniers écarts", () => {
  // Historique réel ALDI : 28/05, 26/06, 29/07, 28/08, 25/09 → écarts 33, 30, 28
  expect(nextPayday(["2026-05-28", "2026-06-26", "2026-07-29", "2026-08-28", "2026-09-25"])).toBe("2026-10-28");
  // Changement d'employeur : la paie passe du 28 au 5 → la prévision suit sans réglage
  expect(nextPayday(["2026-09-25", "2026-10-28", "2026-12-05"])).toBe("2027-01-12");
  expect(nextPayday(["2026-10-28"])).toBe("2026-11-28");
});

const pay = (date: string, amount: number): Transaction => ({
  id: date, date, accountId: "main", description: "ALDI MARCHE", category: "Salaire", amount, currency: "EUR",
  type: "income", internal: false, source: "import", catStatus: "auto", createdAt: "",
});

test("la trésorerie prévoit la paie depuis l'historique, au montant le plus prudent, sans récurrence salaire", () => {
  const data = {
    accounts: [{ id: "main", name: "Principal", type: "main", currency: "EUR", openingBalance: 0, color: "", archived: false }],
    transactions: [pay("2026-07-29", 1600), pay("2026-08-28", 1500), pay("2026-09-25", 1450)],
    recurrences: [],
    goals: [],
  } as unknown as AppData;

  const r = cashflow(data, { scope: "cash", month: "2026-10", includeVariable: false, includeGoalSavings: false }, "2026-10-10");
  expect(r.payday).toMatchObject({ date: "2026-10-25", amount: 1450 }); // 25/09 + 30 j ; min des 3 dernières paies
  expect(r.endBalance).toBe(4550 + 1450);
});
