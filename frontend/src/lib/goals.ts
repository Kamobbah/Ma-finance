import type { AppData, Goal, GoalKind, GoalPriority } from "./types";
import { fromIso, money, MONTHS_LONG, round2, todayIso, toIso } from "./format";

export const kindOf = (g: Goal): GoalKind => g.kind ?? "target";
export const priorityOf = (g: Goal): GoalPriority => g.priority ?? "important";
export const hasTarget = (g: Goal) => (kindOf(g) === "target" || kindOf(g) === "debt") && g.target > 0;
export const isReached = (g: Goal) => hasTarget(g) && g.allocated >= g.target - 0.005;
export const plannedOf = (g: Goal) => (g.monthly && g.monthly > 0 ? g.monthly : 0);

export const KIND_LABELS: Record<GoalKind, { label: string; hint: string }> = {
  target: { label: "Objectif cible", hint: "Un montant à atteindre, avec ou sans date" },
  open: { label: "Objectif ouvert", hint: "Une réserve sans montant final" },
  monthly: { label: "Objectif mensuel", hint: "Un versement régulier chaque mois" },
  debt: { label: "Dette", hint: "Un montant à rembourser par mensualités" },
};

export const PRIORITY: Record<GoalPriority, { label: string; cls: string; rank: number }> = {
  essential: { label: "Essentiel", cls: "bg-rose-50 text-rose-800 ring-rose-200", rank: 0 },
  important: { label: "Important", cls: "bg-amber-50 text-amber-800 ring-amber-200", rank: 1 },
  bonus: { label: "Bonus", cls: "bg-slate-100 text-slate-600 ring-slate-200", rank: 2 },
};

/** Met à jour le statut atteint / en cours selon le montant alloué. */
export function syncGoalStatus(g: Goal): Goal {
  if (isReached(g) && g.status === "active") return { ...g, status: "reached" };
  if (!isReached(g) && g.status === "reached") return { ...g, status: "active", reachedAck: false };
  return g;
}

export function monthsBetween(a: string, b: string) {
  const d1 = fromIso(a);
  const d2 = fromIso(b);
  return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()) + (d2.getDate() - d1.getDate()) / 30;
}

export function addMonths(iso: string, n: number) {
  const d = fromIso(iso);
  d.setMonth(d.getMonth() + n);
  return toIso(d);
}

export function monthYear(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS_LONG[m - 1].toLowerCase()} ${y}`;
}

/** Mois de versement restants cette année (le mois en cours compte s'il n'a pas encore reçu de versement), limités à la date de fin éventuelle. */
export function monthsLeftThisYear(g: Goal, today = todayIso()) {
  const m = fromIso(today).getMonth();
  const y = fromIso(today).getFullYear();
  let end = 11;
  if (g.targetDate) {
    const [ty, tm] = g.targetDate.split("-").map(Number);
    if (ty < y) return 0;
    if (ty === y) end = tm - 1;
  }
  const done = g.history.some((h) => h.amount > 0 && h.date.startsWith(today.slice(0, 7)));
  return Math.max(0, end - m + (done ? 0 : 1));
}

export interface GoalStats {
  kind: GoalKind;
  target: number | null;
  remaining: number | null;
  progress: number | null;
  reached: boolean;
  planned: number;
  minimum: number | null; // minimum souhaité (objectifs sans cible)
  minMissing: number | null; // ce qui manque pour l'atteindre
  required: number | null;
  behind: boolean;
  monthsYear: number;
  projectedYear: number | null;
  eta: string | null;
  pace: number;
}

export function goalStats(g: Goal, today = todayIso()): GoalStats {
  const kind = kindOf(g);
  const target = hasTarget(g) ? g.target : null;
  const remaining = target !== null ? round2(Math.max(0, target - g.allocated)) : null;
  const reached = isReached(g);
  const planned = plannedOf(g);
  const minimum = target === null && g.minimum && g.minimum > 0 ? g.minimum : null;
  const minMissing = minimum !== null ? round2(Math.max(0, minimum - g.allocated)) : null;
  let required: number | null = null;
  if (target !== null && g.targetDate && !reached && remaining) {
    const months = monthsBetween(today, g.targetDate);
    required = months > 0 ? round2(remaining / Math.max(1, months)) : remaining;
  }
  const behind = required !== null && planned > 0 && required > planned + 0.005;
  const monthsYear = monthsLeftThisYear(g, today);
  let projectedYear: number | null = null;
  if (planned > 0) {
    projectedYear = round2(g.allocated + planned * monthsYear);
    if (target !== null) projectedYear = Math.max(g.allocated, Math.min(projectedYear, target));
  }
  // Rythme réel : allocations nettes des 90 derniers jours (ou depuis la création)
  const since = fromIso(today);
  since.setDate(since.getDate() - 90);
  const sinceIso = toIso(since) > g.createdAt.slice(0, 10) ? toIso(since) : g.createdAt.slice(0, 10);
  const recent = g.history.filter((h) => h.date >= sinceIso).reduce((s, h) => s + h.amount, 0);
  const pace = recent > 0 ? round2(recent / Math.max(1, monthsBetween(sinceIso, today))) : 0;
  let eta: string | null = null;
  if (target !== null && remaining !== null) {
    if (reached) eta = today;
    else if (planned > 0) eta = addMonths(today, Math.ceil(remaining / planned));
    else if (pace > 0) eta = addMonths(today, Math.ceil(remaining / pace));
  }
  return { kind, target, remaining, progress: target ? g.allocated / target : null, reached, planned, minimum, minMissing, required, behind, monthsYear, projectedYear, eta, pace };
}

/** Phrase de statut contextuelle affichée sur la carte. */
export function goalStatusLine(g: Goal, s: GoalStats): string {
  if (s.kind === "debt") return `Restant dû : ${money(s.remaining ?? 0)}${s.planned ? ` · ${money(s.planned)}/mois` : ""}${s.eta && !s.reached ? ` · fin prévue ${monthYear(s.eta)}` : s.reached ? " · soldée" : ""}`;
  if (s.kind === "open") return `Alloué : ${money(g.allocated)} · ${s.planned ? `Prévu : ${money(s.planned)}/mois` : "Aucun versement prévu"}`;
  if (s.kind === "monthly") return `Prévu : ${money(s.planned)}/mois · Projeté cette année : ${money(s.projectedYear ?? g.allocated)}`;
  if (s.target === null) return `Alloué : ${money(g.allocated)}`;
  if (!s.reached && s.required !== null && g.targetDate) return `Épargnez ${money(s.required)}/mois pour atteindre ${money(s.target)} d'ici ${monthYear(g.targetDate)}`;
  return `${money(g.allocated)} / ${money(s.target)} · ${Math.round((s.progress ?? 0) * 100)} %`;
}

/** Besoin mensuel : mensuel requis si date cible, sinon mensuel prévu. */
export function monthlyNeed(s: GoalStats) {
  return s.required ?? s.planned;
}

const floor2 = (v: number) => Math.floor(Math.max(0, v) * 100 + 1e-6) / 100;
const capOf = (s: GoalStats) => (s.remaining !== null ? s.remaining : Infinity);

/** Répartition proportionnelle à des poids, plafonnée au restant des objectifs cibles ; jamais plus que le total. */
export function splitByWeights(goals: Goal[], weights: number[], total: number, today = todayIso()): Record<string, number> | null {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return null;
  const out: Record<string, number> = {};
  goals.forEach((g, i) => {
    const s = goalStats(g, today);
    out[g.id] = floor2(Math.min(capOf(s), (total * weights[i]) / sum));
  });
  return out;
}

export function splitByNeed(goals: Goal[], total: number, today = todayIso()) {
  return splitByWeights(goals, goals.map((g) => monthlyNeed(goalStats(g, today))), total, today);
}

/**
 * Suggestion : on sert d'abord les objectifs essentiels, puis ceux dont la date cible approche,
 * puis ceux en retard sur le mensuel requis, puis les importants, enfin les objectifs ouverts / bonus.
 * Chaque objectif reçoit au plus son besoin du mois (ou ce qui manque pour son minimum souhaité) ; le reste éventuel reste non alloué.
 */
export function suggestAllocation(goals: Goal[], total: number, today = todayIso()) {
  const rows = goals.map((g) => ({ g, s: goalStats(g, today) }));
  const key = ({ g, s }: (typeof rows)[number]) => [
    priorityOf(g) === "essential" ? 0 : 1,
    g.targetDate && s.target !== null && !s.reached ? g.targetDate : "9999-12-31",
    s.behind || (s.minMissing ?? 0) > 0 ? 0 : 1,
    priorityOf(g) === "important" ? 0 : 1,
    s.kind === "open" || priorityOf(g) === "bonus" ? 1 : 0,
  ];
  rows.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    return 0;
  });
  let left = floor2(total);
  const out: Record<string, number> = {};
  const order: string[] = [];
  for (const { g, s } of rows) {
    if (s.reached) continue;
    const need = Math.min(capOf(s), s.required ?? Math.max(s.planned, s.minMissing ?? 0, s.planned ? 0 : (s.remaining ?? 0)));
    const give = floor2(Math.min(left, need));
    if (give > 0) {
      out[g.id] = give;
      order.push(g.id);
      left = round2(left - give);
    }
  }
  return { amounts: out, order, left };
}

/** Intérêts : moyenne mensuelle des 3 derniers mois × mois restants dans l'année. */
export function interestEstimate(data: AppData, today = todayIso()) {
  const ids = new Set(data.accounts.filter((a) => a.type === "savings").map((a) => a.id));
  const since = toIso(new Date(fromIso(today).getFullYear(), fromIso(today).getMonth() - 3, 1));
  const tx = data.transactions.filter((t) => ids.has(t.accountId) && t.category === "Intérêts" && t.date >= since && t.date <= today);
  if (!tx.length) return null;
  const avg = tx.reduce((s, t) => s + t.amount, 0) / 3;
  const monthsLeft = 11 - fromIso(today).getMonth();
  return { monthly: round2(avg), total: round2(avg * monthsLeft) };
}
