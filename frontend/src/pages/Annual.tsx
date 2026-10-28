import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingDown, TrendingUp, X } from "lucide-react";
import GlobalFilters from "@/components/GlobalFilters";
import { ChartTooltip, EmptyState, Field, PageHeader, Panel, PanelTitle, StatCard, inputCls } from "@/components/kit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useData, usePrefs } from "@/lib/store";
import { catColor, flow, monthly, scopedTx, scopeLabel } from "@/lib/analytics";
import { compact, money, MONTHS, MONTHS_LONG, round2 } from "@/lib/format";
import { cn } from "@/lib/utils";

function Delta({ cur, prev, invert = false, testid }: { cur: number; prev: number; invert?: boolean; testid?: string }) {
  if (!prev) return <span className="text-slate-400">—</span>;
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  const good = invert ? pct <= 0 : pct >= 0;
  return (
    <span data-testid={testid} className={cn("inline-flex items-center gap-1 font-semibold", good ? "text-emerald-700" : "text-rose-700")}>
      {pct >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
      {pct >= 0 ? "+" : ""}
      {pct.toFixed(1)} %
    </span>
  );
}

export default function Annual() {
  const data = useData();
  const { year, accountFilter, includeInternal } = usePrefs();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const rows = useMemo(() => monthly(data, accountFilter, year, includeInternal, from || undefined, to || undefined), [data, accountFilter, year, includeInternal, from, to]);
  const prevRows = useMemo(() => monthly(data, accountFilter, year - 1, includeInternal), [data, accountFilter, year, includeInternal]);
  const tot = rows.reduce((s, r) => ({ inc: s.inc + r.inc, exp: s.exp + r.exp, pInc: s.pInc + r.plannedInc, pExp: s.pExp + r.plannedExp, count: s.count + r.count }), { inc: 0, exp: 0, pInc: 0, pExp: 0, count: 0 });
  const prevTot = prevRows.reduce((s, r) => ({ inc: s.inc + r.inc, exp: s.exp + r.exp, count: s.count + r.count }), { inc: 0, exp: 0, count: 0 });
  const net = round2(tot.inc - tot.exp);
  const planned = round2(tot.pInc - tot.pExp);
  const hasPrev = prevTot.count > 0;

  const yearTx = useMemo(() => scopedTx(data, accountFilter, from || `${year}-01-01`, to || `${year}-12-31`).filter((t) => t.date.startsWith(String(year))), [data, accountFilter, year, from, to]);
  const { stacked, topCats } = useMemo(() => {
    const totals = new Map<string, number>();
    for (const t of yearTx) {
      const e = flow(t, includeInternal).exp;
      if (e > 0) totals.set(t.category, (totals.get(t.category) ?? 0) + e);
    }
    const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n]) => n);
    const st = MONTHS.map((m) => ({ name: m }) as Record<string, number | string>);
    for (const t of yearTx) {
      const e = flow(t, includeInternal).exp;
      if (e <= 0) continue;
      const key = top.includes(t.category) ? t.category : "Autres";
      const row = st[Number(t.date.slice(5, 7)) - 1];
      row[key] = round2(((row[key] as number) ?? 0) + e);
    }
    return { stacked: st, topCats: totals.size > 6 ? [...top, "Autres"] : top };
  }, [yearTx, includeInternal]);

  let forecastCum = 0;
  const chartRows = rows.map((r, i) => {
    forecastCum += r.net + r.plannedInc - r.plannedExp;
    return {
      name: MONTHS[r.month],
      Revenus: r.inc,
      Dépenses: r.exp,
      "Revenus prévus": r.plannedInc,
      "Dépenses prévues": r.plannedExp,
      Net: r.net,
      Cumul: r.cum,
      "Cumul prévisionnel": round2(forecastCum),
      [`Net ${year - 1}`]: hasPrev ? prevRows[i].net : undefined,
    };
  });
  const deficits = rows.filter((r) => r.count > 0 && r.net < 0).length;

  return (
    <div>
      <PageHeader eyebrow={`Analyse annuelle · ${scopeLabel(data.accounts, accountFilter)}`} title="Le fil de l'année mois après mois" subtitle="Réalisé, prévu (récurrences à venir) et prévisionnel total, mois par mois." />
      <GlobalFilters showAdd={false} />
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Field label="Période personnalisée — du">
          <Input data-testid="annual-from-input" type="date" value={from} min={`${year}-01-01`} max={`${year}-12-31`} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </Field>
        <Field label="au">
          <Input data-testid="annual-to-input" type="date" value={to} min={`${year}-01-01`} max={`${year}-12-31`} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </Field>
        {(from || to) && (
          <Button
            variant="ghost"
            data-testid="annual-clear-period"
            className="h-10 rounded-xl"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            <X /> Année complète
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard testid="annual-income-card" tone="income" label="Revenus annuels" value={money(tot.inc)} sub={hasPrev ? <>vs {year - 1} : <Delta cur={tot.inc} prev={prevTot.inc} testid="annual-income-delta" /></> : `Pas de données ${year - 1}`} />
        <StatCard testid="annual-expense-card" tone="expense" label="Dépenses annuelles" value={money(tot.exp)} sub={hasPrev ? <>vs {year - 1} : <Delta cur={tot.exp} prev={prevTot.exp} invert /></> : `Pas de données ${year - 1}`} />
        <StatCard testid="annual-net-card" tone="net" label="Solde net annuel" value={money(net, "EUR", true)} sub={`${deficits} mois déficitaire${deficits > 1 ? "s" : ""}`} />
        <StatCard testid="annual-forecast-card" tone="savings" label="Prévisionnel total" value={money(net + planned, "EUR", true)} sub={<>Réalisé {money(net, "EUR", true)} · Prévu {money(planned, "EUR", true)}</>} />
      </div>

      {tot.count === 0 ? (
        <Panel className="mt-5">
          <EmptyState title={`Aucune opération en ${year}`} text="Choisissez une autre année ou ajoutez des opérations." />
        </Panel>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Panel testid="annual-monthly-chart">
              <PanelTitle sub="Barres pâles : échéances récurrentes à venir">Mois par mois</PanelTitle>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartRows} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEF0EC" vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }} tickFormatter={(v: number) => compact(v)} width={70} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "#F1F5F9" }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Revenus" stackId="i" fill="#34D399" maxBarSize={20} />
                    <Bar dataKey="Revenus prévus" stackId="i" fill="#A7F3D0" radius={[6, 6, 0, 0]} maxBarSize={20} />
                    <Bar dataKey="Dépenses" stackId="e" fill="#FB7185" maxBarSize={20} />
                    <Bar dataKey="Dépenses prévues" stackId="e" fill="#FECDD3" radius={[6, 6, 0, 0]} maxBarSize={20} />
                    <Line dataKey="Net" stroke="#1E3A8A" strokeWidth={2.5} dot={{ r: 3 }} type="monotone" />
                    {hasPrev && <Line dataKey={`Net ${year - 1}`} stroke="#94A3B8" strokeDasharray="4 4" strokeWidth={2} dot={false} type="monotone" />}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel testid="annual-cumulative-chart">
              <PanelTitle sub="Résultat net cumulé depuis le 1er janvier">Solde cumulé</PanelTitle>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartRows} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEF0EC" vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }} tickFormatter={(v: number) => compact(v)} width={70} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                    <Area dataKey="Cumul prévisionnel" stroke="#F59E0B" strokeDasharray="5 4" fill="none" strokeWidth={2} type="monotone" />
                    <Area dataKey="Cumul" stroke="#2563EB" fill="url(#cumFill)" strokeWidth={2.5} type="monotone" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <Panel className="mt-5" testid="annual-stacked-chart">
            <PanelTitle sub="Dépenses par catégorie, empilées par mois">Catégories mois par mois</PanelTitle>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stacked} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF0EC" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }} tickFormatter={(v: number) => compact(v)} width={70} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "#F1F5F9" }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  {topCats.map((c, i) => (
                    <Bar key={c} dataKey={c} stackId="c" fill={c === "Autres" ? "#CBD5E1" : catColor(data.categories, c)} radius={i === topCats.length - 1 ? [6, 6, 0, 0] : undefined} maxBarSize={34} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel className="mt-5 overflow-hidden p-0 sm:p-0" testid="annual-monthly-table">
            <div className="p-5 pb-0 sm:p-6 sm:pb-0">
              <PanelTitle sub="Les mois déficitaires sont signalés en rouge">Détail mensuel</PanelTitle>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3">Mois</th>
                    <th className="px-3 py-3 text-right">Revenus</th>
                    <th className="px-3 py-3 text-right">Dépenses</th>
                    <th className="px-3 py-3 text-right">Résultat net</th>
                    <th className="px-3 py-3 text-right">Cumul</th>
                    <th className="px-3 py-3 text-right">Prévu</th>
                    {hasPrev && <th className="px-5 py-3 text-right">Net {year - 1}</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const deficit = r.count > 0 && r.net < 0;
                    const p = r.plannedInc - r.plannedExp;
                    return (
                      <tr key={r.month} data-testid={`annual-row-${r.month}`} data-deficit={deficit} className={cn("border-b border-slate-50", deficit && "bg-rose-50/60")}>
                        <td className="px-5 py-3 font-medium text-slate-800">
                          {MONTHS_LONG[r.month]}
                          {deficit && <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700">Déficit</span>}
                        </td>
                        <td className="px-3 py-3 text-right tabular text-emerald-700">{money(r.inc)}</td>
                        <td className="px-3 py-3 text-right tabular text-rose-700">{money(r.exp)}</td>
                        <td className={cn("px-3 py-3 text-right font-semibold tabular", r.net < 0 ? "text-rose-700" : "text-slate-900")}>{money(r.net, "EUR", true)}</td>
                        <td className={cn("px-3 py-3 text-right tabular", r.cum < 0 ? "text-rose-700" : "text-slate-700")}>{money(r.cum, "EUR", true)}</td>
                        <td className="px-3 py-3 text-right tabular text-amber-700">{p ? money(p, "EUR", true) : "—"}</td>
                        {hasPrev && <td className="px-5 py-3 text-right tabular text-slate-500">{money(prevRows[i].net, "EUR", true)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-bold text-slate-900">
                    <td className="px-5 py-3">Total {year}</td>
                    <td className="px-3 py-3 text-right tabular">{money(tot.inc)}</td>
                    <td className="px-3 py-3 text-right tabular">{money(tot.exp)}</td>
                    <td className="px-3 py-3 text-right tabular">{money(net, "EUR", true)}</td>
                    <td />
                    <td className="px-3 py-3 text-right tabular">{planned ? money(planned, "EUR", true) : "—"}</td>
                    {hasPrev && <td className="px-5 py-3 text-right tabular">{money(prevTot.inc - prevTot.exp, "EUR", true)}</td>}
                  </tr>
                </tfoot>
              </table>
            </div>
            {!hasPrev && <p className="px-6 py-4 text-xs text-slate-500" data-testid="annual-no-previous">Aucune donnée pour {year - 1} : la comparaison avec l'année précédente apparaîtra automatiquement dès que des opérations existeront.</p>}
          </Panel>
        </>
      )}
    </div>
  );
}
