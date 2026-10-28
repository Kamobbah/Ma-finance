import type { Recurrence, Transaction } from "./types";
import { fromIso, round2, todayIso, toIso, uid } from "./format";

function addMonthsAnchored(iso: string, months: number, anchorDay: number): string {
  const d = fromIso(iso);
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const dim = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(anchorDay, dim));
  return toIso(target);
}

function addDays(iso: string, days: number): string {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

export function advanceDate(rec: Recurrence, iso: string): string {
  const anchor = fromIso(rec.startDate).getDate();
  switch (rec.frequency) {
    case "daily":
      return addDays(iso, 1);
    case "weekly":
      return addDays(iso, 7);
    case "monthly":
      return addMonthsAnchored(iso, 1, anchor);
    case "yearly":
      return addMonthsAnchored(iso, 12, anchor);
    case "custom": {
      const n = Math.max(1, rec.interval || 1);
      if (rec.intervalUnit === "days") return addDays(iso, n);
      if (rec.intervalUnit === "weeks") return addDays(iso, 7 * n);
      return addMonthsAnchored(iso, n, anchor);
    }
  }
}

interface SimState {
  date: string;
  occurrences: number;
  cumulated: number;
}

/** Montant de la prochaine occurrence, ou null si la récurrence est terminée. */
function nextAmount(rec: Recurrence, s: SimState): number | null {
  if (rec.endMode === "date" && rec.endDate && s.date > rec.endDate) return null;
  if (rec.endMode === "count" && rec.maxCount && s.occurrences >= rec.maxCount) return null;
  if (rec.endMode === "amount" && rec.targetAmount) {
    const left = round2(rec.targetAmount - s.cumulated);
    if (left <= 0) return null;
    return Math.min(rec.amount, left);
  }
  return rec.amount;
}

export function frequencyLabel(rec: Recurrence): string {
  switch (rec.frequency) {
    case "daily":
      return "Quotidienne";
    case "weekly":
      return "Hebdomadaire";
    case "monthly":
      return "Mensuelle";
    case "yearly":
      return "Annuelle";
    case "custom":
      return `Tous les ${rec.interval} ${{ days: "jours", weeks: "semaines", months: "mois" }[rec.intervalUnit]}`;
  }
}

export interface Occurrence {
  recurrenceId: string;
  name: string;
  date: string;
  amount: number; // signé
  accountId: string;
  category: string;
  type: "income" | "expense";
}

/** Échéances prévues (non encore réalisées) entre from et to inclus. */
export function forecast(rec: Recurrence, from: string, to: string, limit = 500): Occurrence[] {
  if (rec.status !== "active") return [];
  const out: Occurrence[] = [];
  const s: SimState = { date: rec.nextDate, occurrences: rec.occurrences, cumulated: rec.cumulated };
  let guard = 0;
  while (s.date <= to && guard++ < 5000 && out.length < limit) {
    const amt = nextAmount(rec, s);
    if (amt === null) break;
    if (s.date >= from) {
      out.push({ recurrenceId: rec.id, name: rec.name, date: s.date, amount: rec.type === "income" ? amt : -amt, accountId: rec.accountId, category: rec.category, type: rec.type });
    }
    s.occurrences++;
    s.cumulated = round2(s.cumulated + amt);
    s.date = advanceDate(rec, s.date);
  }
  return out;
}

/** Crée les transactions dues/en retard et met à jour la récurrence. */
export function processDue(rec: Recurrence, currency: string, today = todayIso()): { rec: Recurrence; created: Transaction[] } {
  if (rec.status !== "active") return { rec, created: [] };
  const created: Transaction[] = [];
  const next = { ...rec };
  let guard = 0;
  while (next.nextDate <= today && guard++ < 2000) {
    const amt = nextAmount(next, { date: next.nextDate, occurrences: next.occurrences, cumulated: next.cumulated });
    if (amt === null) {
      next.status = "ended";
      break;
    }
    created.push({
      id: uid(),
      date: next.nextDate,
      accountId: next.accountId,
      description: next.name,
      category: next.category,
      type: next.type,
      amount: next.type === "income" ? amt : -amt,
      currency,
      note: next.note,
      internal: false,
      source: "recurring",
      catStatus: "manual",
      recurrenceId: next.id,
      createdAt: new Date().toISOString(),
    });
    next.occurrences++;
    next.cumulated = round2(next.cumulated + amt);
    next.nextDate = advanceDate(next, next.nextDate);
  }
  if (next.status === "active" && nextAmount(next, { date: next.nextDate, occurrences: next.occurrences, cumulated: next.cumulated }) === null) {
    next.status = "ended";
  }
  return { rec: next, created };
}
