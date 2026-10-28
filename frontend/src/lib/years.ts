import type { AppData } from "./types";
import { flow, monthly } from "./analytics";
import { round2, todayIso } from "./format";

export interface CatDelta {
  name: string;
  value: number;
  delta: number;
}

export interface YearSummary {
  year: number;
  count: number;
  activeMonths: number;
  inc: number;
  exp: number;
  net: number;
  rate: number | null; // net / revenus
  saved: number; // variation nette du compte d'épargne
  avgExp: number;
  monthlyNet: (number | null)[];
  best: { month: number; net: number } | null;
  worst: { month: number; net: number } | null;
  topCats: CatDelta[];
  rise: CatDelta | null;
  drop: CatDelta | null;
  incDelta: number | null; // % vs N-1
  expDelta: number | null;
  deltaBasis: "total" | "avg"; // comparaison en moyenne mensuelle si l'une des deux années est incomplète
  partial: boolean;
}

const pct = (cur: number, prev: number) => (prev ? ((cur - prev) / Math.abs(prev)) * 100 : null);

/** Résumé de chaque année depuis la première opération (tous comptes EUR, hors virements internes). */
export function yearSummaries(data: AppData, today = todayIso()): YearSummary[] {
  if (!data.transactions.length) return [];
  const first = Number(data.transactions.reduce((m, t) => (t.date < m ? t.date : m), today).slice(0, 4));
  const last = Number(today.slice(0, 4));
  const eur = new Set(data.accounts.filter((a) => a.currency === "EUR").map((a) => a.id));
  const savings = new Set(data.accounts.filter((a) => a.type === "savings").map((a) => a.id));
  const cats = new Map<number, Map<string, number>>();
  const saved = new Map<number, number>();
  for (const t of data.transactions) {
    if (!eur.has(t.accountId) || t.date > today) continue;
    const y = Number(t.date.slice(0, 4));
    if (savings.has(t.accountId)) saved.set(y, (saved.get(y) ?? 0) + t.amount);
    const e = flow(t, false).exp;
    if (e > 0) {
      const m = cats.get(y) ?? new Map<string, number>();
      m.set(t.category, (m.get(t.category) ?? 0) + e);
      cats.set(y, m);
    }
  }
  const out: YearSummary[] = [];
  for (let y = first; y <= last; y++) {
    const rows = monthly(data, "all", y, false, undefined, today);
    const inc = round2(rows.reduce((s, r) => s + r.inc, 0));
    const exp = round2(rows.reduce((s, r) => s + r.exp, 0));
    const count = rows.reduce((s, r) => s + r.count, 0);
    const active = rows.filter((r) => r.count > 0);
    const net = round2(inc - exp);
    const sortedNet = [...active].sort((a, b) => b.net - a.net);
    const cm = cats.get(y) ?? new Map<string, number>();
    const pm = cats.get(y - 1);
    const all = [...cm.entries()].map(([name, v]) => ({ name, value: round2(v), delta: round2(v - (pm?.get(name) ?? 0)) }));
    const topCats = [...all].sort((a, b) => b.value - a.value).slice(0, 3);
    let rise: CatDelta | null = null;
    let drop: CatDelta | null = null;
    const prev = out[out.length - 1];
    if (pm && prev && prev.count > 0) {
      const names = new Set([...cm.keys(), ...pm.keys()]);
      const deltas = [...names].map((name) => ({ name, value: round2(cm.get(name) ?? 0), delta: round2((cm.get(name) ?? 0) - (pm.get(name) ?? 0)) }));
      const up = deltas.filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta)[0];
      const down = deltas.filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta)[0];
      rise = up ?? null;
      drop = down ?? null;
    }
    const hasPrev = !!prev && prev.count > 0;
    const avgBasis = hasPrev && (active.length < 12 || prev.activeMonths < 12);
    const per = (v: number, n: number) => (avgBasis ? v / Math.max(1, n) : v);
    out.push({
      year: y,
      count,
      activeMonths: active.length,
      inc,
      exp,
      net,
      rate: inc > 0 ? net / inc : null,
      saved: round2(saved.get(y) ?? 0),
      avgExp: active.length ? round2(exp / active.length) : 0,
      monthlyNet: rows.map((r) => (r.count > 0 ? r.net : null)),
      best: sortedNet.length ? { month: sortedNet[0].month, net: sortedNet[0].net } : null,
      worst: sortedNet.length > 1 ? { month: sortedNet[sortedNet.length - 1].month, net: sortedNet[sortedNet.length - 1].net } : null,
      topCats,
      rise,
      drop,
      incDelta: hasPrev ? pct(per(inc, active.length), per(prev.inc, prev.activeMonths)) : null,
      expDelta: hasPrev ? pct(per(exp, active.length), per(prev.exp, prev.activeMonths)) : null,
      deltaBasis: avgBasis ? "avg" : "total",
      partial: count > 0 && (active.length < 12 || y === last),
    });
  }
  return out;
}

export type CompareMetric = "exp" | "inc" | "net" | "cum";

/** Séries mensuelles par année pour la comparaison superposée (mois futurs ou vides = null). */
export function compareSeries(data: AppData, years: number[], metric: CompareMetric, today = todayIso()) {
  const per = new Map(years.map((y) => [y, monthly(data, "all", y, false, undefined, today)]));
  return Array.from({ length: 12 }, (_, m) => {
    const row: Record<string, number | null | string> = { m };
    for (const y of years) {
      const rows = per.get(y)!;
      const r = rows[m];
      const future = `${y}-${String(m + 1).padStart(2, "0")}` > today.slice(0, 7);
      const beforeStart = !rows.slice(0, m + 1).some((x) => x.count > 0);
      if (future || beforeStart || (r.count === 0 && metric !== "cum")) {
        row[String(y)] = null;
        continue;
      }
      row[String(y)] = metric === "cum" ? r.cum : r[metric];
    }
    return row;
  });
}
