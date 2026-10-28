import type { AppData } from "./types";
import { accountBalance, flow } from "./analytics";
import { forecast } from "./recurrence";
import { fromIso, round2, todayIso, toIso } from "./format";

/** Une opération de revenu dans cette catégorie est une paie : un nouvel employeur se gère par une règle, pas par le code. */
export const SALARY_CATEGORY = "Salaire";
const DAY = 86400000;
const days = (a: string, b: string) => Math.round((fromIso(b).getTime() - fromIso(a).getTime()) / DAY);
const addDays = (iso: string, n: number) => {
  const d = fromIso(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
};

export function payDates(data: Pick<AppData, "transactions">): string[] {
  return [...new Set(data.transactions.filter((t) => t.category === SALARY_CATEGORY && t.amount > 0).map((t) => t.date))].sort();
}

/**
 * Prochaine paie « au plus tard » : dernière paie + le plus long des 3 derniers écarts.
 * Aucun jour fixe : si l'employeur paie le 5 au lieu du 28, la prévision suit dès la paie suivante.
 */
export function nextPayday(pays: string[]): string | null {
  if (!pays.length) return null;
  const gaps = pays.slice(-4).flatMap((d, i, a) => (i ? [days(a[i - 1], d)] : []));
  return addDays(pays[pays.length - 1], gaps.length ? Math.max(...gaps) : 31);
}

export interface Treasury {
  lastPay: { date: string; amount: number };
  nextPay: string;
  late: boolean; // la paie prévue n'est pas encore saisie
  available: number; // comptes courants + Pockets (hors épargne)
  planned: number; // échéances récurrentes d'ici la paie (signé)
  variable: number; // dépenses courantes estimées d'ici la paie
  carry: number; // ce qui restera la veille de la paie
  since: { inc: number; exp: number }; // flux réels depuis la dernière paie
}

export function treasury(data: AppData, today = todayIso()): Treasury | null {
  const pays = payDates(data).filter((d) => d <= today);
  const next = nextPayday(pays);
  if (!next) return null;
  const last = pays[pays.length - 1];
  const accs = data.accounts.filter((a) => a.currency === "EUR" && !a.archived && a.type !== "savings");
  const ids = new Set(accs.map((a) => a.id));
  const available = round2(accs.reduce((s, a) => s + accountBalance(a, data.transactions, today), 0));
  const late = next < today;
  const left = late ? 0 : days(today, next);
  const planned = round2(data.recurrences.filter((r) => ids.has(r.accountId)).flatMap((r) => forecast(r, addDays(today, 1), addDays(next, -1))).reduce((s, o) => s + o.amount, 0));

  // Rythme des dépenses courantes sur les 3 derniers cycles complets, hors catégories déjà couvertes par une échéance.
  // ponytail: exclusion par catégorie — une dépense ponctuelle dans une catégorie récurrente est ignorée du rythme.
  const recCats = new Set(data.recurrences.filter((r) => r.type === "expense" && r.status === "active").map((r) => r.category));
  const from = pays[Math.max(0, pays.length - 4)];
  let spent = 0;
  for (const t of data.transactions) {
    if (!ids.has(t.accountId) || t.date < from || t.date >= last || t.recurrenceId || recCats.has(t.category)) continue;
    spent += flow(t, false).exp;
  }
  const cycleDays = days(from, last);
  const variable = cycleDays > 0 ? round2((spent / cycleDays) * left) : 0;

  let inc = 0;
  let exp = 0;
  for (const t of data.transactions) {
    if (!ids.has(t.accountId) || t.date < last || t.date > today) continue;
    const f = flow(t, false);
    inc += f.inc;
    exp += f.exp;
  }
  const lastAmount = round2(data.transactions.filter((t) => t.date === last && t.category === SALARY_CATEGORY && t.amount > 0).reduce((s, t) => s + t.amount, 0));
  return {
    lastPay: { date: last, amount: lastAmount },
    nextPay: next,
    late,
    available,
    planned,
    variable,
    carry: round2(available + planned - variable),
    since: { inc: round2(inc), exp: round2(exp) },
  };
}
