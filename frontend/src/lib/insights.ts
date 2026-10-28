import type { Account, AppData } from "./types";
import { forecast } from "./recurrence";
import { accountBalance, catColor, flow } from "./analytics";
import { budgetStatuses, shiftMonth } from "./budgets";
import { fromIso, round2, todayIso, toIso } from "./format";

/* ---------------- Rappels d'échéances ---------------- */
export type ReminderStage = "J" | "J-1" | "J-3";
export interface Reminder {
  key: string;
  recurrenceId: string;
  name: string;
  date: string;
  amount: number;
  accountId: string;
  daysUntil: number;
  stage: ReminderStage;
}

const stageOf = (d: number): ReminderStage => (d <= 0 ? "J" : d === 1 ? "J-1" : "J-3");

/** Prélèvements/abonnements (récurrences de dépense) qui passent aujourd'hui ou dans les 3 prochains jours. */
export function upcomingReminders(data: AppData, today = todayIso()): Reminder[] {
  const end = new Date(fromIso(today));
  end.setDate(end.getDate() + 3);
  const endIso = toIso(end);
  const out: Reminder[] = [];
  const dayMs = 86400000;
  for (const r of data.recurrences) {
    if (r.type !== "expense") continue;
    for (const o of forecast(r, today, endIso, 4)) {
      const d = Math.round((fromIso(o.date).getTime() - fromIso(today).getTime()) / dayMs);
      out.push({ key: `${r.id}|${o.date}|${stageOf(d)}`, recurrenceId: r.id, name: r.name, date: o.date, amount: o.amount, accountId: r.accountId, daysUntil: d, stage: stageOf(d) });
    }
  }
  // Échéances du jour déjà générées automatiquement à l'ouverture
  for (const t of data.transactions) {
    if (t.source !== "recurring" || t.date !== today || t.amount >= 0 || !t.recurrenceId) continue;
    const key = `${t.recurrenceId}|${t.date}|J`;
    if (!out.some((x) => x.key === key)) out.push({ key, recurrenceId: t.recurrenceId, name: t.description, date: t.date, amount: t.amount, accountId: t.accountId, daysUntil: 0, stage: "J" });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount);
}

export function reminderLabel(r: Reminder) {
  if (r.daysUntil <= 0) return "Aujourd'hui";
  if (r.daysUntil === 1) return "Demain";
  return `Dans ${r.daysUntil} jours`;
}

/* ---------------- Solde bas d'une Pocket ---------------- */
export interface LowBalanceAlert {
  key: string;
  accountId: string;
  accountName: string;
  balance: number;
  due: number; // total des échéances à venir sur la fenêtre
  shortfall: number; // montant manquant au pire moment
  firstShortDate: string; // première échéance qui ne passe pas
  items: { name: string; date: string; amount: number }[];
}

export const LOW_BALANCE_DAYS = 7;

/** Pockets dont le solde actuel ne couvre pas les prélèvements récurrents des 7 prochains jours. */
export function lowBalanceAlerts(data: AppData, today = todayIso(), days = LOW_BALANCE_DAYS): LowBalanceAlert[] {
  const end = new Date(fromIso(today));
  end.setDate(end.getDate() + days);
  const endIso = toIso(end);
  const out: LowBalanceAlert[] = [];
  for (const acc of data.accounts) {
    if (acc.type !== "pocket" || acc.archived) continue;
    const items = data.recurrences
      .filter((r) => r.type === "expense" && r.accountId === acc.id)
      .flatMap((r) => forecast(r, today, endIso, 10).map((o) => ({ name: r.name, date: o.date, amount: -o.amount })))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!items.length) continue;
    const balance = accountBalance(acc, data.transactions, today);
    let run = balance;
    let worst = 0;
    let firstShortDate = "";
    for (const it of items) {
      run = round2(run - it.amount);
      if (run < 0 && !firstShortDate) firstShortDate = it.date;
      worst = Math.min(worst, run);
    }
    if (!firstShortDate) continue;
    const shortfall = round2(-worst);
    out.push({ key: `low|${acc.id}|${firstShortDate}|${shortfall}`, accountId: acc.id, accountName: acc.name, balance, due: round2(items.reduce((s, i) => s + i.amount, 0)), shortfall, firstShortDate, items });
  }
  return out.sort((a, b) => a.firstShortDate.localeCompare(b.firstShortDate));
}

/* ---------------- Bilan du mois ---------------- */
export interface PocketRecap {
  acc: Account;
  tIn: number;
  tOut: number;
  start: number;
  end: number;
}

export function computeRecap(data: AppData, mk: string) {
  const eur = new Set(data.accounts.filter((a) => a.currency === "EUR").map((a) => a.id));
  const sum = (m: string) => {
    let inc = 0;
    let exp = 0;
    for (const t of data.transactions) {
      if (!eur.has(t.accountId) || !t.date.startsWith(m)) continue;
      const f = flow(t, false);
      inc += f.inc;
      exp += f.exp;
    }
    return { inc: round2(inc), exp: round2(exp), net: round2(inc - exp) };
  };
  const cur = sum(mk);
  const prev = sum(shiftMonth(mk, -1));
  const monthTx = data.transactions.filter((t) => eur.has(t.accountId) && t.date.startsWith(mk));
  const cats = new Map<string, number>();
  for (const t of monthTx) {
    const e = flow(t, false).exp;
    if (e > 0) cats.set(t.category, (cats.get(t.category) ?? 0) + e);
  }
  const topCats = [...cats.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, value]) => ({ name, value: round2(value), color: catColor(data.categories, name) }));

  const budgets = budgetStatuses(data, mk).map((s) => ({ category: s.budget.category, spent: s.spent, limit: s.limit, held: s.spent <= s.limit, ratio: s.ratio }));

  const [y, m] = mk.split("-").map(Number);
  const firstDay = `${mk}-01`;
  const lastDay = toIso(new Date(y, m, 0));
  const dayBefore = toIso(new Date(y, m - 1, 0));
  const pockets: PocketRecap[] = data.accounts
    .filter((a) => a.type === "pocket" && !a.archived)
    .map((acc) => {
      const txs = data.transactions.filter((t) => t.accountId === acc.id && t.date >= firstDay && t.date <= lastDay);
      return {
        acc,
        tIn: round2(txs.filter((t) => t.type === "transfer_in").reduce((s, t) => s + t.amount, 0)),
        tOut: round2(txs.filter((t) => t.type === "transfer_out").reduce((s, t) => s - t.amount, 0)),
        start: accountBalance(acc, data.transactions, dayBefore),
        end: accountBalance(acc, data.transactions, lastDay),
      };
    })
    .filter((p) => p.tIn || p.tOut || p.start || p.end)
    .sort((a, b) => b.tIn - a.tIn);

  const savingsAccs = data.accounts.filter((a) => a.type === "savings");
  const savTx = data.transactions.filter((t) => savingsAccs.some((a) => a.id === t.accountId) && t.date >= firstDay && t.date <= lastDay);
  const savings = {
    start: round2(savingsAccs.reduce((s, a) => s + accountBalance(a, data.transactions, dayBefore), 0)),
    end: round2(savingsAccs.reduce((s, a) => s + accountBalance(a, data.transactions, lastDay), 0)),
    interest: round2(savTx.filter((t) => t.category === "Intérêts").reduce((s, t) => s + t.amount, 0)),
    deposits: round2(savTx.filter((t) => t.type === "transfer_in").reduce((s, t) => s + t.amount, 0)),
    withdrawals: round2(savTx.filter((t) => t.type === "transfer_out").reduce((s, t) => s - t.amount, 0)),
    allocated: round2(data.goals.flatMap((g) => g.history).filter((h) => h.date.startsWith(mk)).reduce((s, h) => s + h.amount, 0)),
  };
  return { mk, cur, prev, topCats, budgets, pockets, savings, txCount: monthTx.length };
}
export type MonthRecap = ReturnType<typeof computeRecap>;
