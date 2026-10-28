import { getData, getPrefs, setPrefs, update } from "./store";
import { budgetLimit, shiftMonth } from "./budgets";
import { round2, todayIso } from "./format";
import type { BudgetPrep } from "./types";

const CATCH_UP_DAYS = 7;

function lastDayOf(mk: string) {
  const [y, m] = mk.split("-").map(Number);
  return `${mk}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

/**
 * Mois à préparer aujourd'hui : le mois suivant si l'on est le dernier jour du mois,
 * ou le mois en cours (rattrapage) si l'appli n'a pas été ouverte le dernier jour et qu'on est dans les premiers jours.
 */
export function prepWindow(today = todayIso()): { from: string; to: string } | null {
  const mk = today.slice(0, 7);
  if (today === lastDayOf(mk)) return { from: mk, to: shiftMonth(mk, 1) };
  if (Number(today.slice(8)) <= CATCH_UP_DAYS) return { from: shiftMonth(mk, -1), to: mk };
  return null;
}

/** Copie automatiquement les plafonds du mois écoulé sur le mois suivant (sans toucher aux ajustements manuels). Retourne le mois préparé. */
export function runAutoBudgetPrep(today = todayIso()): string | null {
  const prefs = getPrefs();
  if (prefs.autoBudgetPrep === false) return null;
  const w = prepWindow(today);
  if (!w || prefs.budgetPrep?.[w.to]) return null;
  const budgets = getData().budgets.filter((b) => !b.startMonth || b.startMonth <= w.to);
  if (!budgets.length) return null;
  const changes: BudgetPrep["changes"] = [];
  let kept = 0;
  for (const b of budgets) {
    if (w.to in b.overrides) {
      kept++;
      continue;
    }
    const value = round2(budgetLimit(b, w.from));
    if (value !== b.amount) changes.push({ id: b.id, prev: null, value });
  }
  if (changes.length) {
    update((d) => ({
      ...d,
      budgets: d.budgets.map((b) => {
        const c = changes.find((x) => x.id === b.id);
        return c ? { ...b, overrides: { ...b.overrides, [w.to]: c.value } } : b;
      }),
    }));
  }
  setPrefs({ budgetPrep: { ...(prefs.budgetPrep ?? {}), [w.to]: { from: w.from, at: today, status: "pending", changes, kept } } });
  return w.to;
}

export function validateBudgetPrep(mk: string) {
  const p = getPrefs().budgetPrep?.[mk];
  if (p) setPrefs({ budgetPrep: { ...getPrefs().budgetPrep, [mk]: { ...p, status: "validated" } } });
}

/** Annule la préparation : remet les plafonds du mois tels qu'ils étaient avant. */
export function cancelBudgetPrep(mk: string) {
  const p = getPrefs().budgetPrep?.[mk];
  if (!p) return;
  update((d) => ({
    ...d,
    budgets: d.budgets.map((b) => {
      const c = p.changes.find((x) => x.id === b.id);
      if (!c || b.overrides[mk] !== c.value) return b; // modifié depuis : on garde le choix de l'utilisateur
      const overrides = { ...b.overrides };
      if (c.prev === null) delete overrides[mk];
      else overrides[mk] = c.prev;
      return { ...b, overrides };
    }),
  }));
  setPrefs({ budgetPrep: { ...getPrefs().budgetPrep, [mk]: { ...p, status: "cancelled" } } });
}
