import type { AppData, Budget } from "./types";
import { flow } from "./analytics";
import { round2 } from "./format";

export type BudgetLevel = "ok" | "warn" | "over";

export const monthKey = (iso: string) => iso.slice(0, 7);

export function budgetLimit(b: Budget, mk: string): number {
  return b.overrides[mk] ?? b.amount;
}

/** Dépenses réelles (hors virements internes) par catégorie pour un mois "YYYY-MM", tous comptes EUR. */
export function spentByCategory(data: AppData, mk: string): Map<string, number> {
  const eur = new Set(data.accounts.filter((a) => a.currency === "EUR").map((a) => a.id));
  const m = new Map<string, number>();
  for (const t of data.transactions) {
    if (!eur.has(t.accountId) || !t.date.startsWith(mk)) continue;
    const e = flow(t, false).exp;
    if (e) m.set(t.category, (m.get(t.category) ?? 0) + e);
  }
  return m;
}

export function levelOf(spent: number, limit: number): BudgetLevel {
  if (limit <= 0) return spent > 0 ? "over" : "ok";
  const r = spent / limit;
  return r > 1 ? "over" : r >= 0.8 ? "warn" : "ok";
}

export interface BudgetStatus {
  budget: Budget;
  limit: number;
  spent: number;
  ratio: number;
  remaining: number;
  level: BudgetLevel;
}

export function budgetStatuses(data: AppData, mk: string): BudgetStatus[] {
  const spent = spentByCategory(data, mk);
  return data.budgets.map((b) => {
    const limit = budgetLimit(b, mk);
    const s = round2(Math.max(0, spent.get(b.category) ?? 0));
    return { budget: b, limit, spent: s, ratio: limit > 0 ? s / limit : s > 0 ? 2 : 0, remaining: round2(limit - s), level: levelOf(s, limit) };
  });
}

/** Moyenne des dépenses mensuelles d'une catégorie sur les 3 mois complets précédant mk. */
export function averageSpent(data: AppData, category: string, mk: string): number {
  const [y, m] = mk.split("-").map(Number);
  let total = 0;
  for (let i = 1; i <= 3; i++) {
    const d = new Date(y, m - 1 - i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    total += spentByCategory(data, k).get(category) ?? 0;
  }
  return round2(total / 3);
}

export const LEVEL_STYLES: Record<BudgetLevel, { bar: string; text: string; chip: string; label: string }> = {
  ok: { bar: "#10B981", text: "text-emerald-700", chip: "bg-emerald-50 text-emerald-800 ring-emerald-200", label: "Dans le budget" },
  warn: { bar: "#F59E0B", text: "text-amber-700", chip: "bg-amber-50 text-amber-800 ring-amber-200", label: "Bientôt atteint" },
  over: { bar: "#E11D48", text: "text-rose-700", chip: "bg-rose-50 text-rose-700 ring-rose-200", label: "Dépassé" },
};
