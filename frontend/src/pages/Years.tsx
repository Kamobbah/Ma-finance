import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, CalendarRange, Minus, Trophy } from "lucide-react";
import { ChartTooltip, Chip, EmptyState, PageHeader, Panel, PanelTitle, StatCard } from "@/components/kit";
import { useData } from "@/lib/store";
import { compareSeries, yearSummaries, type CompareMetric, type YearSummary } from "@/lib/years";
import { compact, money, MONTHS, MONTHS_LONG, round2, todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";

const YEAR_COLORS = ["#2563EB", "#F59E0B", "#94A3B8", "#10B981", "#EC4899", "#8B5CF6", "#06B6D4", "#F43F5E"];
const METRICS: { id: CompareMetric; label: string }[] = [
  { id: "exp", label: "Dépenses" },
  { id: "inc", label: "Revenus" },
  { id: "net", label: "Résultat net" },
  { id: "cum", label: "Net cumulé" },
];

function Delta({ v, invert = false, testid }: { v: number | null; invert?: boolean; testid?: string }) {
  if (v === null) return <span className="text-slate-400">—</span>;
  const good = invert ? v <= 0 : v >= 0;
  const Icon = Math.abs(v) < 0.5 ? Minus : v > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span data-testid={testid} className={cn("inline-flex items-center gap-0.5 text-[11px] font-semibold tabular", good ? "text-emerald-700" : "text-rose-700")}>
      <Icon className="size-3" />
      {v > 0 ? "+" : ""}
      {v.toFixed(1)} %
    </span>
  );
}

function trends(s: YearSummary, prev?: YearSummary): string[] {
  const t: string[] = [];
  if (s.rate !== null) t.push(s.rate >= 0 ? `Vous avez gardé ${Math.round(s.rate * 100)} % de vos revenus.` : `Vous avez dépensé ${Math.round(-s.rate * 100)} % de plus que vos revenus.`);
  if (prev && prev.count > 0 && s.expDelta !== null) t.push(`${s.deltaBasis === "avg" ? "Dépenses mensuelles moyennes" : "Dépenses"} ${s.expDelta >= 0 ? "en hausse" : "en baisse"} de ${Math.abs(s.expDelta).toFixed(0)} % par rapport à ${prev.year}${s.deltaBasis === "avg" ? " (année incomplète)" : ""}.`);
  if (s.topCats[0]) t.push(`Premier poste de dépense : ${s.topCats[0].name} (${money(s.topCats[0].value)}, ${s.exp ? Math.round((s.topCats[0].value / s.exp) * 100) : 0} %).`);
  if (s.rise) t.push(`Plus forte hausse : ${s.rise.name} (+${money(s.rise.delta)}).`);
  if (s.drop) t.push(`Plus forte baisse : ${s.drop.name} (${money(s.drop.delta)}).`);
  if (s.best && s.worst) t.push(`Meilleur mois : ${MONTHS_LONG[s.best.month].toLowerCase()} (${money(s.best.net, "EUR", true)}) · plus difficile : ${MONTHS_LONG[s.worst.month].toLowerCase()} (${money(s.worst.net, "EUR", true)}).`);
  if (s.saved) t.push(`${s.saved > 0 ? "Épargne alimentée" : "Épargne puisée"} de ${money(Math.abs(s.saved))} sur l'année.`);
  return t;
}

function YearCard({ s, prev, current }: { s: YearSummary; prev?: YearSummary; current: boolean }) {
  if (s.count === 0) {
    return (
      <div data-testid={`year-card-${s.year}`} className="flex items-center justify-between rounded-3xl border border-dashed border-slate-200 bg-white/50 px-5 py-4 text-sm text-slate-400">
        <span className="font-bold text-slate-500">{s.year}</span>
        <span>Aucune opération enregistrée</span>
      </div>
    );
  }
  return (
    <div data-testid={`year-card-${s.year}`} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-[0_4px_24px_-12px_rgba(15,23,42,0.08)] transition-shadow duration-200 hover:shadow-md sm:p-6 animate-rise">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-2xl font-extrabold tracking-tight text-slate-900">{s.year}</h3>
        {current && <Chip className="bg-blue-50 text-blue-800 ring-blue-200">En cours</Chip>}
        {s.partial && !current && <Chip className="bg-slate-100 text-slate-600 ring-slate-200">Année partielle · {s.activeMonths} mois</Chip>}
        <span className="ml-auto text-xs text-slate-400">{s.count} opérations</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl bg-emerald-50/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800/70">Revenus</p>
          <p className="mt-1 text-lg font-extrabold tabular text-emerald-900" data-testid={`year-${s.year}-inc`}>
            {money(s.inc)}
          </p>
          <Delta v={s.incDelta} testid={`year-${s.year}-inc-delta`} />
          {s.deltaBasis === "avg" && s.incDelta !== null && <span className="ml-1 text-[10px] text-emerald-800/60">moy./mois</span>}
        </div>
        <div className="rounded-2xl bg-rose-50/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-800/70">Dépenses</p>
          <p className="mt-1 text-lg font-extrabold tabular text-rose-900" data-testid={`year-${s.year}-exp`}>
            {money(s.exp)}
          </p>
          <Delta v={s.expDelta} invert testid={`year-${s.year}-exp-delta`} />
          {s.deltaBasis === "avg" && s.expDelta !== null && <span className="ml-1 text-[10px] text-rose-800/60">moy./mois</span>}
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Résultat net</p>
          <p className={cn("mt-1 text-lg font-extrabold tabular", s.net < 0 ? "text-rose-700" : "text-slate-900")} data-testid={`year-${s.year}-net`}>
            {money(s.net, "EUR", true)}
          </p>
          <span className="text-[11px] text-slate-500">{s.rate !== null ? `Taux d'épargne ${Math.round(s.rate * 100)} %` : "—"}</span>
        </div>
        <div className="rounded-2xl bg-amber-50/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-800/70">Épargne</p>
          <p className="mt-1 text-lg font-extrabold tabular text-amber-900" data-testid={`year-${s.year}-saved`}>
            {money(s.saved, "EUR", true)}
          </p>
          <span className="text-[11px] text-slate-500">Variation du compte d'épargne</span>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[1fr_220px]">
        <ul className="space-y-1.5 text-sm text-slate-700" data-testid={`year-${s.year}-trends`}>
          {trends(s, prev).map((t) => (
            <li key={t} className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-slate-300" />
              {t}
            </li>
          ))}
        </ul>
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Net mois par mois</p>
          <div className="flex h-16 gap-[3px]">
            {s.monthlyNet.map((v, i) => {
              const max = Math.max(1, ...s.monthlyNet.map((x) => Math.abs(x ?? 0)));
              const h = v === null ? 0 : Math.max(8, (Math.abs(v) / max) * 100);
              return (
                <div key={i} className="flex flex-1 flex-col" title={`${MONTHS[i]} : ${v === null ? "—" : money(v, "EUR", true)}`}>
                  <div className="flex flex-1 items-end">{v !== null && v >= 0 && <div className="w-full rounded-t-sm bg-emerald-400" style={{ height: `${h}%` }} />}</div>
                  <div className="h-px bg-slate-200" />
                  <div className="flex flex-1 items-start">{v !== null && v < 0 && <div className="w-full rounded-b-sm bg-rose-400" style={{ height: `${h}%` }} />}</div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>janv.</span>
            <span>déc.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Years() {
  const data = useData();
  const today = todayIso();
  const summaries = useMemo(() => yearSummaries(data, today), [data, today]);
  const withData = summaries.filter((s) => s.count > 0).map((s) => s.year);
  const defaults = [2024, 2025, 2026].filter((y) => withData.includes(y));
  const [years, setYears] = useState<number[]>(defaults.length ? defaults : withData.slice(-3));
  const [metric, setMetric] = useState<CompareMetric>("exp");
  const series = useMemo(() => compareSeries(data, years, metric, today), [data, years, metric, today]);
  const chartRows = series.map((r) => ({ ...r, name: MONTHS[r.m as number] }));
  const colorOf = (y: number) => YEAR_COLORS[(withData.length - 1 - withData.indexOf(y)) % YEAR_COLORS.length];

  const tot = summaries.reduce((s, y) => ({ inc: s.inc + y.inc, exp: s.exp + y.exp }), { inc: 0, exp: 0 });
  const best = summaries.filter((s) => s.count > 0).sort((a, b) => b.net - a.net)[0];
  const overview = summaries.filter((s) => s.count > 0).map((s) => ({ name: String(s.year), Revenus: s.inc, Dépenses: s.exp, Net: s.net }));
  const toggle = (y: number) => setYears((cur) => (cur.includes(y) ? cur.filter((x) => x !== y) : [...cur, y].sort()));

  if (!summaries.length) {
    return (
      <div>
        <PageHeader eyebrow="Bilan annuel" title="Vos années en un coup d'œil" />
        <Panel>
          <EmptyState title="Aucune opération" text="Importez un relevé pour voir le bilan de chaque année." />
        </Panel>
      </div>
    );
  }
  const firstYear = summaries[0].year;
  return (
    <div>
      <PageHeader eyebrow={`Bilan annuel · depuis ${firstYear}`} title="Vos années en un coup d'œil" subtitle="Revenus, dépenses, épargne et grandes tendances de chaque année. Tous comptes EUR, virements internes exclus." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard testid="years-count-card" label="Années suivies" value={`${withData.length}`} icon={<CalendarRange className="size-4 text-slate-600" />} sub={`De ${firstYear} à ${today.slice(0, 4)}`} />
        <StatCard testid="years-income-card" tone="income" label="Revenus cumulés" value={money(round2(tot.inc))} />
        <StatCard testid="years-expense-card" tone="expense" label="Dépenses cumulées" value={money(round2(tot.exp))} />
        <StatCard testid="years-best-card" tone="net" label="Meilleure année" value={best ? String(best.year) : "—"} icon={<Trophy className="size-4 text-blue-700" />} sub={best ? `Résultat net ${money(best.net, "EUR", true)}` : undefined} />
      </div>

      <Panel className="mt-5" testid="years-compare-panel">
        <PanelTitle
          sub="Les années superposées mois par mois"
          aside={
            <div className="flex flex-wrap gap-1 rounded-2xl bg-slate-100/80 p-1">
              {METRICS.map((m) => (
                <button key={m.id} data-testid={`compare-metric-${m.id}`} onClick={() => setMetric(m.id)} className={cn("rounded-xl px-3 py-1.5 text-xs font-semibold transition-[background-color,color] duration-200", metric === m.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900")}>
                  {m.label}
                </button>
              ))}
            </div>
          }
        >
          Comparaison des années
        </PanelTitle>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {withData.map((y) => {
            const on = years.includes(y);
            return (
              <button key={y} data-testid={`compare-year-${y}`} aria-pressed={on} onClick={() => toggle(y)} className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition-[background-color,opacity] duration-200", on ? "bg-white text-slate-900 ring-slate-300" : "bg-slate-50 text-slate-400 ring-slate-200 hover:text-slate-700")}>
                <span className="size-2.5 rounded-full" style={{ background: on ? colorOf(y) : "#CBD5E1" }} />
                {y}
              </button>
            );
          })}
        </div>
        {years.length === 0 ? (
          <EmptyState title="Choisissez au moins une année" />
        ) : (
          <div className="h-80" data-testid="years-compare-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartRows} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF0EC" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }} tickFormatter={(v: number) => compact(v)} width={70} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                {years.map((y) => (
                  <Line key={y} dataKey={String(y)} stroke={colorOf(y)} strokeWidth={y === Number(today.slice(0, 4)) ? 3 : 2} dot={{ r: 2.5 }} type="monotone" connectNulls={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel className="mt-5" testid="years-overview-panel">
        <PanelTitle sub="Revenus, dépenses et résultat net par année">Vue d'ensemble</PanelTitle>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={overview} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF0EC" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }} tickFormatter={(v: number) => compact(v)} width={70} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#F1F5F9" }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Revenus" fill="#34D399" radius={[6, 6, 0, 0]} maxBarSize={28} />
              <Bar dataKey="Dépenses" fill="#FB7185" radius={[6, 6, 0, 0]} maxBarSize={28} />
              <Bar dataKey="Net" fill="#1E3A8A" radius={[6, 6, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="mt-5 space-y-4" data-testid="years-list">
        {[...summaries].reverse().map((s) => (
          <YearCard key={s.year} s={s} prev={summaries.find((p) => p.year === s.year - 1)} current={s.year === Number(today.slice(0, 4))} />
        ))}
      </div>
    </div>
  );
}
