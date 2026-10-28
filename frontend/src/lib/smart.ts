import type { AppData, Transaction } from "./types";
import { merchantKey } from "./subscriptions";

export interface Suggestion {
  category: string;
  confidence: number; // 0-1
  support: number; // opérations similaires catégorisées
  similarIds: string[]; // opérations similaires encore à vérifier / non classées
}

interface Index {
  byKey: Map<string, Map<string, number>>; // clé marchand -> catégorie -> nb
  pending: Map<string, string[]>; // clé marchand -> ids à vérifier
  recurring: Set<string>; // clés marchand récurrentes
}
const cache = new WeakMap<Transaction[], Index>();
const UNSET = new Set(["", "Non classé", "Autres"]);

function build(data: AppData): Index {
  const hit = cache.get(data.transactions);
  if (hit) return hit;
  const byKey = new Map<string, Map<string, number>>();
  const pending = new Map<string, string[]>();
  const months = new Map<string, { months: Set<string>; amounts: number[] }>();
  for (const t of data.transactions) {
    if (t.internal) continue;
    const k = merchantKey(t.description);
    if (k.length < 3) continue;
    if (t.catStatus === "to_review" || UNSET.has(t.category)) pending.set(k, [...(pending.get(k) ?? []), t.id]);
    if (t.catStatus !== "to_review" && !UNSET.has(t.category)) {
      const m = byKey.get(k) ?? new Map<string, number>();
      m.set(t.category, (m.get(t.category) ?? 0) + (t.catStatus === "manual" ? 2 : 1));
      byKey.set(k, m);
    }
    if (t.amount < 0) {
      const g = months.get(k) ?? { months: new Set(), amounts: [] };
      g.months.add(t.date.slice(0, 7));
      g.amounts.push(-t.amount);
      months.set(k, g);
    }
  }
  const recurring = new Set<string>();
  for (const [k, g] of months) {
    if (g.months.size < 3) continue;
    const s = [...g.amounts].sort((a, b) => a - b);
    const med = s[Math.floor(s.length / 2)];
    const stable = g.amounts.filter((a) => Math.abs(a - med) <= Math.max(1, med * 0.15)).length / g.amounts.length;
    if (stable >= 0.7 && g.amounts.length <= g.months.size * 1.5) recurring.add(k);
  }
  const idx = { byKey, pending, recurring };
  cache.set(data.transactions, idx);
  return idx;
}

/** Catégorie suggérée d'après les opérations similaires déjà classées. */
export function suggestCategory(data: AppData, t: Transaction): Suggestion | null {
  const idx = build(data);
  const k = merchantKey(t.description);
  const m = idx.byKey.get(k);
  if (!m) return null;
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  const [category, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  if (category === t.category && t.catStatus !== "to_review") return null;
  return { category, confidence: n / total, support: total, similarIds: idx.pending.get(k) ?? [] };
}

/** Dépense récurrente (même marchand, montant stable, sur au moins 3 mois) ou issue d'une récurrence. */
export function isRecurringTx(data: AppData, t: Transaction) {
  if (t.recurrenceId) return true;
  if (t.amount >= 0 || t.internal) return false;
  return build(data).recurring.has(merchantKey(t.description));
}

/** Confiance faible : opération à vérifier. */
export const LOW_CONFIDENCE = 0.6;
