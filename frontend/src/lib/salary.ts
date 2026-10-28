import type { AppData } from "./types";
import { fromIso, round2, toIso } from "./format";

/** Une opération de revenu dans cette catégorie est une paie : un nouvel employeur se gère par une règle, pas par le code. */
export const SALARY_CATEGORY = "Salaire";
const DAY = 86400000;
const days = (a: string, b: string) => Math.round((fromIso(b).getTime() - fromIso(a).getTime()) / DAY);
const addDays = (iso: string, n: number) => {
  const d = fromIso(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
};

const isPay = (t: AppData["transactions"][number]) => t.category === SALARY_CATEGORY && t.amount > 0;

export function payDates(data: Pick<AppData, "transactions">): string[] {
  return [...new Set(data.transactions.filter(isPay).map((t) => t.date))].sort();
}

/** Plus long des 3 derniers écarts entre paies (31 j s'il n'y a qu'une paie). */
function payGap(pays: string[]): number {
  const gaps = pays.slice(-4).flatMap((d, i, a) => (i ? [days(a[i - 1], d)] : []));
  return gaps.length ? Math.max(...gaps) : 31;
}

/**
 * Prochaine paie « au plus tard » : dernière paie + le plus long des 3 derniers écarts.
 * Aucun jour fixe : si l'employeur paie le 5 au lieu du 28, la prévision suit dès la paie suivante.
 */
export function nextPayday(pays: string[]): string | null {
  return pays.length ? addDays(pays[pays.length - 1], payGap(pays)) : null;
}

/** Paies prévues jusqu'à `until`, au montant le plus bas des 3 dernières (le salaire varie : on reste prudent). */
export function predictedPays(data: AppData, today: string, until: string): { date: string; amount: number; accountId: string }[] {
  const past = data.transactions.filter((t) => isPay(t) && t.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const pays = [...new Set(past.map((t) => t.date))];
  if (!pays.length) return [];
  const byDay = (d: string) => past.filter((t) => t.date === d).reduce((s, t) => s + t.amount, 0);
  const amount = round2(Math.min(...pays.slice(-3).map(byDay)));
  const accountId = past[past.length - 1].accountId;
  const gap = payGap(pays);
  const out = [];
  for (let d = addDays(pays[pays.length - 1], gap); d <= until; d = addDays(d, gap)) out.push({ date: d, amount, accountId });
  return out;
}
