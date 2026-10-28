import type { Account, AppData, Category, Recurrence, Transaction } from "./types";
import { forecast, type Occurrence } from "./recurrence";
import { round2, todayIso } from "./format";

export function scopeIds(accounts: Account[], filter: string): Set<string> {
  if (filter === "all") return new Set(accounts.filter((a) => a.currency === "EUR").map((a) => a.id));
  if (filter === "pockets") return new Set(accounts.filter((a) => a.type === "pocket").map((a) => a.id));
  return new Set([filter]);
}

export function scopeLabel(accounts: Account[], filter: string): string {
  if (filter === "all") return "Tous les comptes";
  if (filter === "pockets") return "Toutes les Pockets";
  return accounts.find((a) => a.id === filter)?.name ?? "Compte";
}

export interface Flow {
  inc: number;
  exp: number;
}

export function flow(t: { type: Transaction["type"]; amount: number; internal?: boolean }, includeInternal: boolean): Flow {
  const isTransfer = t.type === "transfer_in" || t.type === "transfer_out" || t.internal;
  if (isTransfer && !includeInternal) return { inc: 0, exp: 0 };
  if (t.type === "income" || t.type === "transfer_in") return { inc: t.amount, exp: 0 };
  return { inc: 0, exp: -t.amount };
}

export function inRange(date: string, from?: string, to?: string) {
  return (!from || date >= from) && (!to || date <= to);
}

export function scopedTx(data: AppData, filter: string, from?: string, to?: string): Transaction[] {
  const ids = scopeIds(data.accounts, filter);
  return data.transactions.filter((t) => ids.has(t.accountId) && inRange(t.date, from, to));
}

export function sumFlows(txs: { type: Transaction["type"]; amount: number; internal?: boolean }[], includeInternal: boolean) {
  let inc = 0;
  let exp = 0;
  for (const t of txs) {
    const f = flow(t, includeInternal);
    inc += f.inc;
    exp += f.exp;
  }
  return { inc: round2(inc), exp: round2(exp), net: round2(inc - exp) };
}

export interface MonthRow {
  month: number; // 0-11
  inc: number;
  exp: number;
  net: number;
  cum: number;
  plannedInc: number;
  plannedExp: number;
  count: number;
}

export function plannedOccurrences(recs: Recurrence[], ids: Set<string>, from: string, to: string): Occurrence[] {
  const start = from > todayIso() ? from : nextDay(todayIso());
  if (start > to) return [];
  return recs.flatMap((r) => forecast(r, start, to)).filter((o) => ids.has(o.accountId));
}

function nextDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function monthly(data: AppData, filter: string, year: number, includeInternal: boolean, from?: string, to?: string): MonthRow[] {
  const yFrom = `${year}-01-01`;
  const yTo = `${year}-12-31`;
  const f = from && from > yFrom ? from : yFrom;
  const tt = to && to < yTo ? to : yTo;
  const rows: MonthRow[] = Array.from({ length: 12 }, (_, i) => ({ month: i, inc: 0, exp: 0, net: 0, cum: 0, plannedInc: 0, plannedExp: 0, count: 0 }));
  for (const t of scopedTx(data, filter, f, tt)) {
    const m = Number(t.date.slice(5, 7)) - 1;
    const fl = flow(t, includeInternal);
    rows[m].inc += fl.inc;
    rows[m].exp += fl.exp;
    rows[m].count++;
  }
  for (const o of plannedOccurrences(data.recurrences, scopeIds(data.accounts, filter), f, tt)) {
    if (o.internal && !includeInternal) continue;
    const m = Number(o.date.slice(5, 7)) - 1;
    if (o.amount > 0) rows[m].plannedInc += o.amount;
    else rows[m].plannedExp += -o.amount;
  }
  let cum = 0;
  for (const r of rows) {
    r.inc = round2(r.inc);
    r.exp = round2(r.exp);
    r.net = round2(r.inc - r.exp);
    r.plannedInc = round2(r.plannedInc);
    r.plannedExp = round2(r.plannedExp);
    cum += r.net;
    r.cum = round2(cum);
  }
  return rows;
}

export function categoryBreakdown(txs: Transaction[], categories: Category[], includeInternal: boolean) {
  const map = new Map<string, number>();
  for (const t of txs) {
    const f = flow(t, includeInternal);
    if (f.exp > 0) map.set(t.category, (map.get(t.category) ?? 0) + f.exp);
  }
  const color = (n: string) => categories.find((c) => c.name === n)?.color ?? "#94A3B8";
  const total = [...map.values()].reduce((s, v) => s + v, 0);
  return [...map.entries()]
    .map(([name, value]) => ({ name, value: round2(value), color: color(name), pct: total ? value / total : 0 }))
    .sort((a, b) => b.value - a.value);
}

export function accountBalance(acc: Account, txs: Transaction[], upTo = todayIso()): number {
  return round2(txs.filter((t) => t.accountId === acc.id && t.date <= upTo).reduce((s, t) => s + t.amount, acc.openingBalance));
}

export function catColor(categories: Category[], name: string) {
  return categories.find((c) => c.name === name)?.color ?? "#94A3B8";
}

/** Évolution du solde d'un compte : un point au début de période puis un point par jour d'opération. */
export function balanceSeries(acc: Account, txs: Transaction[], from: string, to: string): { date: string; balance: number }[] {
  const own = txs.filter((t) => t.accountId === acc.id).sort((a, b) => a.date.localeCompare(b.date));
  let bal = acc.openingBalance;
  for (const t of own) if (t.date < from) bal += t.amount;
  const out: { date: string; balance: number }[] = [{ date: from, balance: round2(bal) }];
  for (const t of own) {
    if (t.date < from || t.date > to) continue;
    bal += t.amount;
    const last = out[out.length - 1];
    if (last.date === t.date) last.balance = round2(bal);
    else out.push({ date: t.date, balance: round2(bal) });
  }
  if (out[out.length - 1].date < to) out.push({ date: to, balance: round2(bal) });
  return out;
}
