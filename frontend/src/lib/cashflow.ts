import type { AppData, Recurrence } from "./types";
import { accountBalance, flow } from "./analytics";
import { forecast } from "./recurrence";
import { fromIso, round2, todayIso, toIso } from "./format";
import { plannedOf } from "./goals";

export type CashKind = "income" | "fixed" | "savings" | "transfer" | "goal";
export interface CashEvent {
  date: string;
  name: string;
  amount: number; // signé
  kind: CashKind;
  recurrenceId?: string;
  late?: boolean;
  accountId: string;
}
export interface CashDay {
  date: string;
  balance: number;
  events: CashEvent[];
  variable: number; // dépenses variables estimées ce jour
  actual: boolean; // jour passé : flux réels
}
export interface CashflowResult {
  month: string;
  isCurrent: boolean;
  scopeIds: string[];
  startBalance: number; // solde au début de la période affichée (aujourd'hui pour le mois en cours)
  availableToday: number;
  days: CashDay[];
  endBalance: number;
  min: { balance: number; date: string };
  firstNegative?: string;
  payday?: { date: string; amount: number; name: string };
  negativeBeforePayday: boolean;
  received: number; // revenus déjà reçus ce mois
  remainingIncome: number; // revenus attendus d'ici la fin du mois
  plannedIncome: number; // revenus du mois (reçus + attendus)
  plannedExpenses: number; // dépenses du mois (réelles + prévues + variables)
  spent: number; // dépenses réelles déjà passées ce mois
  remainingFixed: number; // charges fixes et épargne encore à venir
  requiredCarryover: number; // argent nécessaire en début de mois pour ne jamais passer sous 0
  shortfallNow: number; // ce qui manque dès aujourd'hui pour éviter le négatif
  variableMonthly: number;
  variableEstimated: number; // estimation automatique (moyenne 3 mois)
  goalSavings: number;
}

export interface CashflowOptions {
  scope: string; // "cash" = compte principal + Pockets, ou id de compte
  month: string; // YYYY-MM (mois en cours ou futur)
  variableMonthly?: number; // surcharge de l'estimation
  includeVariable: boolean;
  includeGoalSavings: boolean;
}

export function cashScopeIds(data: AppData, scope: string): string[] {
  if (scope === "cash") return data.accounts.filter((a) => a.currency === "EUR" && !a.archived && (a.type === "main" || a.type === "pocket")).map((a) => a.id);
  return data.accounts.some((a) => a.id === scope) ? [scope] : [];
}

const monthEnd = (mk: string) => {
  const [y, m] = mk.split("-").map(Number);
  return toIso(new Date(y, m, 0));
};
const addDay = (iso: string, n = 1) => {
  const d = fromIso(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
};
const daysIn = (mk: string) => Number(monthEnd(mk).slice(8));

function counterpartOf(rec: Recurrence, accountId: string) {
  return accountId === rec.accountId ? rec.toAccountId : rec.accountId;
}

/** Charge récurrente « proche » d'une opération réelle : sert à ne pas compter deux fois les charges fixes dans la moyenne des dépenses variables. */
function looksRecurring(data: AppData, t: { amount: number; category: string; recurrenceId?: string }) {
  if (t.recurrenceId) return true;
  const a = Math.abs(t.amount);
  return data.recurrences.some((r) => r.type === "expense" && r.category === t.category && Math.abs(a - r.amount) <= Math.max(1, r.amount * 0.1));
}

/** Moyenne mensuelle des dépenses variables (hors charges récurrentes et virements internes) sur les 3 derniers mois complets. */
export function estimateVariable(data: AppData, ids: Set<string>, today = todayIso()) {
  const t0 = fromIso(today);
  const from = toIso(new Date(t0.getFullYear(), t0.getMonth() - 3, 1));
  const to = toIso(new Date(t0.getFullYear(), t0.getMonth(), 0));
  let total = 0;
  for (const t of data.transactions) {
    if (!ids.has(t.accountId) || t.date < from || t.date > to) continue;
    const e = flow(t, false).exp;
    if (e > 0 && !looksRecurring(data, t)) total += e;
  }
  return round2(total / 3);
}

export function cashflow(data: AppData, opts: CashflowOptions, today = todayIso()): CashflowResult {
  const ids = cashScopeIds(data, opts.scope);
  const idSet = new Set(ids);
  const curMk = today.slice(0, 7);
  const mk = opts.month < curMk ? curMk : opts.month;
  const isCurrent = mk === curMk;
  const end = monthEnd(mk);
  const monthStart = `${mk}-01`;
  const availableToday = round2(data.accounts.filter((a) => idSet.has(a.id)).reduce((s, a) => s + accountBalance(a, data.transactions, today), 0));

  // Événements prévus d'aujourd'hui à la fin du mois choisi
  const events: CashEvent[] = [];
  for (const r of data.recurrences) {
    for (const o of forecast(r, "0000-01-01", end, 400)) {
      if (!idSet.has(o.accountId)) continue;
      let kind: CashKind = o.type === "income" ? "income" : "fixed";
      if (o.internal) {
        const cp = counterpartOf(r, o.accountId);
        if (cp && idSet.has(cp)) continue; // virement interne au périmètre : neutre
        kind = data.accounts.find((a) => a.id === cp)?.type === "savings" && o.amount < 0 ? "savings" : "transfer";
      }
      const late = o.date < today;
      events.push({ date: late ? today : o.date, name: o.name, amount: o.amount, kind, recurrenceId: r.id, late, accountId: o.accountId });
    }
  }

  // Revenus du mois : jour de paie = plus gros revenu prévu du mois
  const monthIncome = events.filter((e) => e.date >= monthStart && e.date <= end && e.amount > 0 && e.kind === "income");
  const payEvent = [...monthIncome].sort((a, b) => b.amount - a.amount)[0];

  // Épargne prévue des objectifs, réservée le jour de la paie (ou en fin de mois)
  const goalSavings = opts.includeGoalSavings ? round2(data.goals.filter((g) => g.status === "active").reduce((s, g) => s + plannedOf(g), 0)) : 0;
  const goalDay = (m: string) => {
    const pay = events.filter((e) => e.kind === "income" && e.amount > 0 && e.date.startsWith(m)).sort((a, b) => b.amount - a.amount)[0];
    return pay?.date ?? monthEnd(m);
  };

  // Dépenses variables
  const variableEstimated = estimateVariable(data, idSet, today);
  const variableMonthly = opts.includeVariable ? Math.max(0, opts.variableMonthly ?? variableEstimated) : 0;
  const curVariableSpent = round2(
    data.transactions.filter((t) => idSet.has(t.accountId) && t.date >= `${curMk}-01` && t.date <= today && !looksRecurring(data, t)).reduce((s, t) => s + flow(t, false).exp, 0),
  );
  const curRemainingDays = Math.max(1, daysIn(curMk) - Number(today.slice(8)));
  const variableFor = (date: string) => {
    if (!variableMonthly || date <= today) return 0;
    if (date.startsWith(curMk)) return Math.max(0, variableMonthly - curVariableSpent) / curRemainingDays;
    return variableMonthly / daysIn(date.slice(0, 7));
  };

  // Simulation jour par jour depuis aujourd'hui
  const byDate = new Map<string, CashEvent[]>();
  for (const e of events) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  if (goalSavings > 0) {
    for (let m = curMk; m <= mk; m = shift(m)) {
      const d = goalDay(m);
      if (d < today) continue;
      byDate.set(d, [...(byDate.get(d) ?? []), { date: d, name: "Épargne prévue des objectifs", amount: -goalSavings, kind: "goal", accountId: ids[0] ?? "" }]);
    }
  }
  let bal = availableToday;
  let startBalance = availableToday;
  const days: CashDay[] = [];
  // jours passés du mois en cours : flux réels, pour la courbe et le report nécessaire
  const actualByDate = new Map<string, number>();
  if (isCurrent) {
    for (const t of data.transactions) {
      if (!idSet.has(t.accountId) || t.date < monthStart || t.date > today) continue;
      if (t.internal && t.counterpartAccountId && idSet.has(t.counterpartAccountId)) continue;
      actualByDate.set(t.date, (actualByDate.get(t.date) ?? 0) + t.amount);
    }
    // reconstitue la courbe passée à partir du solde d'aujourd'hui
    let back = availableToday;
    const past: CashDay[] = [];
    for (let d = today; d >= monthStart; d = addDay(d, -1)) {
      past.unshift({ date: d, balance: round2(back), events: [], variable: 0, actual: true });
      back -= actualByDate.get(d) ?? 0;
    }
    startBalance = round2(back); // solde au 1er du mois (avant opérations)
    days.push(...past);
  }
  // le jour J : événements en retard / dus aujourd'hui
  const todayEvents = byDate.get(today) ?? [];
  if (todayEvents.length) {
    bal = round2(bal + todayEvents.reduce((s, e) => s + e.amount, 0));
    if (isCurrent) {
      const last = days[days.length - 1];
      last.events = todayEvents;
      last.balance = bal;
      last.actual = false;
    }
  }
  for (let d = addDay(today); d <= end; d = addDay(d)) {
    const ev = byDate.get(d) ?? [];
    const v = variableFor(d);
    bal = round2(bal + ev.reduce((s, e) => s + e.amount, 0) - v);
    if (d < monthStart) continue;
    if (!isCurrent && d === monthStart) startBalance = round2(bal - ev.reduce((s, e) => s + e.amount, 0) + v);
    days.push({ date: d, balance: bal, events: ev, variable: round2(v), actual: false });
  }
  const future = days.filter((d) => d.date >= today);
  const scan = future.length ? future : days;
  const minDay = scan.reduce((m, d) => (d.balance < m.balance ? d : m), scan[0] ?? { balance: bal, date: today });
  const firstNegative = scan.find((d) => d.balance < -0.005)?.date;

  // Report nécessaire : cumul des flux du mois depuis 0 au 1er (réels passés + prévus)
  let cum = 0;
  let minCum = 0;
  let received = 0;
  let spent = 0;
  if (isCurrent) {
    for (const t of data.transactions) {
      if (!idSet.has(t.accountId) || t.date < monthStart || t.date > today) continue;
      if (t.internal && t.counterpartAccountId && idSet.has(t.counterpartAccountId)) continue;
      if (t.type === "income") received += t.amount;
      else if (t.amount < 0) spent -= t.amount;
    }
  }
  for (const d of days) {
    const flowDay = (isCurrent && d.date <= today ? (actualByDate.get(d.date) ?? 0) : 0) + (d.actual ? 0 : d.events.reduce((s, e) => s + e.amount, 0) - d.variable);
    cum += flowDay;
    minCum = Math.min(minCum, cum);
  }
  const fut = days.filter((d) => !d.actual);
  const remainingIncome = round2(fut.reduce((s, d) => s + d.events.filter((e) => e.amount > 0 && e.kind === "income").reduce((a, e) => a + e.amount, 0), 0));
  const remainingFixed = round2(fut.reduce((s, d) => s + d.events.filter((e) => e.amount < 0).reduce((a, e) => a - e.amount, 0), 0));
  const remainingVariable = round2(fut.reduce((s, d) => s + d.variable, 0));
  return {
    month: mk,
    isCurrent,
    scopeIds: ids,
    startBalance,
    availableToday,
    days,
    endBalance: days.length ? days[days.length - 1].balance : bal,
    min: { balance: round2(minDay?.balance ?? bal), date: minDay?.date ?? today },
    firstNegative,
    payday: payEvent ? { date: payEvent.date, amount: payEvent.amount, name: payEvent.name } : undefined,
    negativeBeforePayday: !!firstNegative && (!payEvent || firstNegative < payEvent.date),
    received: round2(received),
    remainingIncome,
    plannedIncome: round2(received + remainingIncome),
    plannedExpenses: round2(spent + remainingFixed + remainingVariable),
    spent: round2(spent),
    remainingFixed,
    requiredCarryover: round2(Math.max(0, -minCum)),
    shortfallNow: round2(Math.max(0, -(minDay?.balance ?? 0))),
    variableMonthly: round2(variableMonthly),
    variableEstimated,
    goalSavings,
  };
}

function shift(mk: string) {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Dernier revenu de type salaire dans l'historique (pour proposer la récurrence). */
export function detectSalary(data: AppData) {
  const list = data.transactions.filter((t) => t.type === "income" && /salaire/i.test(t.category + " " + t.description)).sort((a, b) => b.date.localeCompare(a.date));
  const last = list[0];
  if (!last) return null;
  return { amount: round2(last.amount), day: Number(last.date.slice(8)), accountId: last.accountId, name: last.description, category: last.category || "Salaire" };
}
