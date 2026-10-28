import type { AppData, Recurrence } from "./types";
import { fromIso, round2, todayIso, toIso } from "./format";

export interface SubscriptionSuggestion {
  key: string;
  name: string;
  amount: number; // positif, dernier montant
  median: number;
  accountId: string;
  category: string;
  months: number;
  occurrences: { date: string; amount: number }[];
  lastDate: string;
  nextDate: string;
}

const EXCLUDED_CATEGORIES = new Set(["Virements internes", "Arrondis RevPoints", "Retraits d'espèces"]);

export function merchantKey(desc: string): string {
  return desc
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[0-9*#.,/_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;

function nextMonthly(lastDate: string, today: string): string {
  const day = fromIso(lastDate).getDate();
  const d = fromIso(lastDate);
  let i = 1;
  let candidate = lastDate;
  while (candidate <= today && i < 60) {
    const t = new Date(d.getFullYear(), d.getMonth() + i, 1);
    const dim = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    t.setDate(Math.min(day, dim));
    candidate = toIso(t);
    i++;
  }
  return candidate;
}

function coveredByRecurrence(key: string, recs: Recurrence[]) {
  return recs.some((r) => {
    if (r.status === "ended" || r.type !== "expense") return false;
    const rk = merchantKey(r.name);
    const nameHit = rk.length >= 3 && (rk.includes(key) || key.includes(rk));
    return nameHit;
  });
}

/**
 * Détecte les dépenses au montant stable (±10 %) qui reviennent chaque mois
 * (au moins 3 mois, dernière occurrence il y a moins de 45 jours).
 */
export function detectSubscriptions(data: AppData, today = todayIso()): SubscriptionSuggestion[] {
  const groups = new Map<string, { date: string; amount: number; accountId: string; category: string; description: string }[]>();
  for (const t of data.transactions) {
    if (t.amount >= 0 || t.internal || t.type !== "expense" || EXCLUDED_CATEGORIES.has(t.category) || t.date > today) continue;
    const key = merchantKey(t.description);
    if (key.length < 3) continue;
    const list = groups.get(key) ?? [];
    list.push({ date: t.date, amount: -t.amount, accountId: t.accountId, category: t.category, description: t.description });
    groups.set(key, list);
  }
  const recentLimit = new Date(fromIso(today));
  recentLimit.setDate(recentLimit.getDate() - 45);
  const recentIso = toIso(recentLimit);

  const out: SubscriptionSuggestion[] = [];
  for (const [key, list] of groups) {
    if (data.dismissedSubscriptions.includes(key)) continue;
    list.sort((a, b) => a.date.localeCompare(b.date));
    const last = list[list.length - 1];
    if (last.date < recentIso) continue;
    const ref = last.amount;
    // occurrences au montant stable (±10 % du dernier montant), une par mois
    const stable = list.filter((x) => Math.abs(x.amount - ref) <= ref * 0.1);
    const byMonth = new Map<number, (typeof list)[number]>();
    for (const x of stable) byMonth.set(monthIndex(x.date), x);
    if (byMonth.size < 3) continue;
    if (stable.length > byMonth.size * 1.34) continue; // plusieurs fois par mois : pas un abonnement mensuel
    const months = [...byMonth.keys()].sort((a, b) => a - b);
    // série mensuelle terminant sur la dernière occurrence (trous d'un mois tolérés)
    let run = 1;
    for (let i = months.length - 1; i > 0; i--) {
      if (months[i] - months[i - 1] <= 2) run++;
      else break;
    }
    if (run < 3) continue;
    const occ = months.slice(-run).map((m) => byMonth.get(m)!);
    const med = round2(median(occ.map((o) => o.amount)));
    if (coveredByRecurrence(key, data.recurrences)) continue;
    out.push({
      key,
      name: last.description,
      amount: round2(ref),
      median: med,
      accountId: last.accountId,
      category: last.category,
      months: run,
      occurrences: occ.map((o) => ({ date: o.date, amount: o.amount })),
      lastDate: last.date,
      nextDate: nextMonthly(last.date, today),
    });
  }
  return out.sort((a, b) => b.amount - a.amount);
}
