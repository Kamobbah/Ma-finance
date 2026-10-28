import type { Recurrence, Transaction } from "./types";
import { fromIso, round2, todayIso, toIso, uid } from "./format";
import { INTERNAL_CATEGORY as TRANSFER_CATEGORY } from "./rules";

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
    return Math.min(rec.amountOverrides?.[s.date] ?? rec.amount, left);
  }
  return rec.amountOverrides?.[s.date] ?? rec.amount;
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
  type: Recurrence["type"];
  internal: boolean; // jambe d'un virement automatique entre comptes
}

/** Échéances prévues (non encore réalisées) entre from et to inclus. */
export function forecast(rec: Recurrence, from: string, to: string, limit = 500): Occurrence[] {
  if (rec.status !== "active") return [];
  const out: Occurrence[] = [];
  const s: SimState = { date: rec.nextDate, occurrences: rec.occurrences, cumulated: rec.cumulated };
  let guard = 0;
  while (s.date <= to && guard++ < 5000 && out.length < limit) {
    if (rec.skips?.includes(s.date)) {
      s.date = advanceDate(rec, s.date);
      continue;
    }
    const amt = nextAmount(rec, s);
    if (amt === null) break;
    if (s.date >= from) {
      if (rec.type === "transfer") {
        out.push({ recurrenceId: rec.id, name: rec.name, date: s.date, amount: -amt, accountId: rec.accountId, category: TRANSFER_CATEGORY, type: rec.type, internal: true });
        if (rec.toAccountId) out.push({ recurrenceId: rec.id, name: rec.name, date: s.date, amount: amt, accountId: rec.toAccountId, category: TRANSFER_CATEGORY, type: rec.type, internal: true });
      } else out.push({ recurrenceId: rec.id, name: rec.name, date: s.date, amount: rec.type === "income" ? amt : -amt, accountId: rec.accountId, category: rec.category, type: rec.type, internal: false });
    }
    s.occurrences++;
    s.cumulated = round2(s.cumulated + amt);
    s.date = advanceDate(rec, s.date);
  }
  return out;
}

/** Enregistre la prochaine échéance (en sautant les échéances mises en pause). */
export function postNext(rec: Recurrence, currency: string): { rec: Recurrence; created: Transaction[] } {
  const next = { ...rec };
  while (next.skips?.includes(next.nextDate)) next.nextDate = advanceDate(next, next.nextDate);
  const amt = nextAmount(next, { date: next.nextDate, occurrences: next.occurrences, cumulated: next.cumulated });
  if (amt === null) return { rec: { ...next, status: "ended" }, created: [] };
  const created: Transaction[] = [];
  const base = { date: next.nextDate, description: next.name, currency, note: next.note, source: "recurring" as const, catStatus: "manual" as const, recurrenceId: next.id, createdAt: new Date().toISOString() };
  if (next.type === "transfer") {
    created.push({ ...base, id: uid(), category: TRANSFER_CATEGORY, internal: true, accountId: next.accountId, type: "transfer_out", amount: -amt, counterpartAccountId: next.toAccountId });
    if (next.toAccountId) created.push({ ...base, id: uid(), category: TRANSFER_CATEGORY, internal: true, accountId: next.toAccountId, type: "transfer_in", amount: amt, counterpartAccountId: next.accountId });
  } else created.push({ ...base, id: uid(), category: next.category, internal: false, accountId: next.accountId, type: next.type, amount: next.type === "income" ? amt : -amt });
  next.occurrences++;
  next.cumulated = round2(next.cumulated + amt);
  if (next.amountOverrides?.[next.nextDate] !== undefined) {
    const o = { ...next.amountOverrides };
    delete o[next.nextDate];
    next.amountOverrides = o;
  }
  next.nextDate = advanceDate(next, next.nextDate);
  while (next.skips?.includes(next.nextDate)) next.nextDate = advanceDate(next, next.nextDate);
  if (nextAmount(next, { date: next.nextDate, occurrences: next.occurrences, cumulated: next.cumulated }) === null) next.status = "ended";
  return { rec: next, created };
}

/** Crée les transactions dues et met à jour la récurrence (sauf validation manuelle). */
export function processDue(rec: Recurrence, currency: string, today = todayIso()): { rec: Recurrence; created: Transaction[] } {
  if (rec.status !== "active" || rec.manual) return { rec, created: [] };
  let cur = rec;
  const created: Transaction[] = [];
  let guard = 0;
  while (cur.status === "active" && cur.nextDate <= today && guard++ < 2000) {
    const r = postNext(cur, currency);
    cur = r.rec;
    created.push(...r.created);
  }
  return { rec: cur, created };
}

export type RecPeriodStatus = "paid" | "upcoming" | "late" | "paused" | "ended";

/** Statut du mois en cours : payée, à venir, en retard (validation manuelle non faite). */
export function recPeriodStatus(rec: Recurrence, txs: Transaction[], today = todayIso()): RecPeriodStatus {
  if (rec.status === "ended") return "ended";
  if (rec.status === "paused") return "paused";
  if (rec.nextDate < today) return "late";
  const mk = today.slice(0, 7);
  if (txs.some((t) => t.recurrenceId === rec.id && t.date.startsWith(mk))) return "paid";
  return "upcoming";
}
