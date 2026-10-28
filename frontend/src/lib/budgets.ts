import type { AppData, Budget, Transaction } from "./types";
import { flow } from "./analytics";
import { round2, todayIso } from "./format";

export type BudgetLevel = "ok" | "warn" | "over";

export const monthKey = (iso: string) => iso.slice(0, 7);

export function shiftMonth(mk: string, delta: number) {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Plafond de base d'un mois (défaut ou ajustement), hors report. */
export function budgetLimit(b: Budget, mk: string): number {
  return b.overrides[mk] ?? b.amount;
}

const spentCache = new WeakMap<Transaction[], Map<string, Map<string, number>>>();

/** Dépenses réelles (hors virements internes) d'un mois "YYYY-MM", indexées "compte|catégorie", comptes EUR. */
function spentIndex(data: AppData, mk: string): Map<string, number> {
  let byMonth = spentCache.get(data.transactions);
  if (!byMonth) {
    byMonth = new Map();
    spentCache.set(data.transactions, byMonth);
  }
  const hit = byMonth.get(mk);
  if (hit) return hit;
  const eur = new Set(data.accounts.filter((a) => a.currency === "EUR").map((a) => a.id));
  const m = new Map<string, number>();
  for (const t of data.transactions) {
    if (!eur.has(t.accountId) || !t.date.startsWith(mk)) continue;
    const e = flow(t, false).exp;
    if (!e) continue;
    for (const k of [`${t.accountId}|${t.category}`, `${t.accountId}|`, `|${t.category}`]) m.set(k, (m.get(k) ?? 0) + e);
  }
  byMonth.set(mk, m);
  return m;
}

/** Dépenses par catégorie, tous comptes EUR. */
export function spentByCategory(data: AppData, mk: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, v] of spentIndex(data, mk)) if (k.startsWith("|")) out.set(k.slice(1), v);
  return out;
}

export type BudgetScope = Pick<Budget, "category" | "accountId">;

/** Dépensé sur le périmètre d'un budget (compte et/ou catégorie). */
export function budgetSpent(data: AppData, b: BudgetScope, mk: string): number {
  return round2(Math.max(0, spentIndex(data, mk).get(`${b.accountId ?? ""}|${b.category}`) ?? 0));
}

export const scopeKey = (b: BudgetScope) => `${b.accountId ?? ""}|${b.category}`;

/** Libellé lisible : « Courses », « Courses · Madré », « Madré · toutes catégories ». */
export function budgetLabel(data: AppData, b: BudgetScope): string {
  const acc = b.accountId ? (data.accounts.find((a) => a.id === b.accountId)?.name ?? "Compte supprimé") : "";
  if (!acc) return b.category;
  return b.category ? `${b.category} · ${acc}` : `${acc} · toutes catégories`;
}

/**
 * Report du reste positif : carry(mk) = max(0, plafond effectif(mk-1) - dépensé(mk-1)),
 * à partir du mois de départ du budget. Les mois futurs ne génèrent pas de report au-delà du mois en cours.
 */
export function budgetCarry(data: AppData, b: Budget, mk: string): number {
  if (b.rollover === false) return 0;
  const start = b.startMonth ?? todayIso().slice(0, 7);
  if (mk <= start) return 0;
  const current = todayIso().slice(0, 7);
  let carry = 0;
  let m = start;
  let guard = 0;
  while (m < mk && guard++ < 240) {
    if (m > current) break;
    const eff = budgetLimit(b, m) + carry;
    const spent = budgetSpent(data, b, m);
    carry = Math.max(0, round2(eff - spent));
    m = shiftMonth(m, 1);
  }
  return m === mk ? carry : 0;
}

export function effectiveLimit(data: AppData, b: Budget, mk: string): number {
  return round2(budgetLimit(b, mk) + budgetCarry(data, b, mk));
}

export function levelOf(spent: number, limit: number): BudgetLevel {
  if (limit <= 0) return spent > 0 ? "over" : "ok";
  const r = spent / limit;
  return r > 1 ? "over" : r >= 0.8 ? "warn" : "ok";
}

export interface BudgetStatus {
  budget: Budget;
  base: number;
  carry: number;
  limit: number; // base + report
  spent: number;
  ratio: number;
  remaining: number;
  level: BudgetLevel;
}

export function budgetStatuses(data: AppData, mk: string): BudgetStatus[] {
  return data.budgets.map((b) => {
    const base = budgetLimit(b, mk);
    const carry = budgetCarry(data, b, mk);
    const limit = round2(base + carry);
    const s = budgetSpent(data, b, mk);
    return { budget: b, base, carry, limit, spent: s, ratio: limit > 0 ? s / limit : s > 0 ? 2 : 0, remaining: round2(limit - s), level: levelOf(s, limit) };
  });
}

/** Moyenne des dépenses mensuelles d'un périmètre sur les 3 mois complets précédant mk. */
export function averageSpent(data: AppData, scope: BudgetScope, mk: string): number {
  let total = 0;
  for (let i = 1; i <= 3; i++) total += budgetSpent(data, scope, shiftMonth(mk, -i));
  return round2(total / 3);
}

export const LEVEL_STYLES: Record<BudgetLevel, { bar: string; text: string; chip: string; label: string }> = {
  ok: { bar: "#10B981", text: "text-emerald-700", chip: "bg-emerald-50 text-emerald-800 ring-emerald-200", label: "Dans le budget" },
  warn: { bar: "#F59E0B", text: "text-amber-700", chip: "bg-amber-50 text-amber-800 ring-amber-200", label: "Bientôt atteint" },
  over: { bar: "#E11D48", text: "text-rose-700", chip: "bg-rose-50 text-rose-700 ring-rose-200", label: "Dépassé" },
};
