import { useMemo, useState } from "react";
import TodayOverview from "@/components/TodayOverview";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, CalendarClock, Landmark, Pause, Pencil, Scale, Square, Wallet } from "lucide-react";
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import GlobalFilters from "@/components/GlobalFilters";
import { Amount, ChartTooltip, ConfirmDialog, EmptyState, Panel, PanelTitle, StatCard, TypeBadge } from "@/components/kit";
import { saveRecurrence, useData, usePrefs } from "@/lib/store";
import { accountBalance, categoryBreakdown, monthly, plannedOccurrences, scopedTx, scopeLabel, sumFlows } from "@/lib/analytics";
import { compact, fmtDate, money, MONTHS, MONTHS_LONG, todayIso } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import type { Recurrence } from "@/lib/types";
import { budgetStatuses, LEVEL_STYLES, shiftMonth } from "@/lib/budgets";
import { computeRecap } from "@/lib/insights";
import { openRecap } from "@/lib/ui";
import { CalendarCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const data = useData();
  const prefs = usePrefs();
  const navigate = useNavigate();
  const [stopRec, setStopRec] = useState<Recurrence | null>(null);
  const { year, accountFilter, includeInternal } = prefs;
  const today = todayIso();

  const yearTx = useMemo(() => scopedTx(data, accountFilter, `${year}-01-01`, `${year}-12-31`), [data, accountFilter, year]);
  const totals = useMemo(() => sumFlows(yearTx, includeInternal), [yearTx, includeInternal]);
  const months = useMemo(() => monthly(data, accountFilter, year, includeInternal), [data, accountFilter, year, includeInternal]);
  const cats = useMemo(() => categoryBreakdown(yearTx, data.categories, includeInternal), [yearTx, data.categories, includeInternal]);
  const monthPrefix = today.slice(0, 7);
  const thisMonth = useMemo(() => sumFlows(scopedTx(data, accountFilter, `${monthPrefix}-01`, `${monthPrefix}-31`), includeInternal), [data, accountFilter, monthPrefix, includeInternal]);

  const balances = data.accounts.filter((a) => !a.archived).map((a) => ({ acc: a, bal: accountBalance(a, data.transactions, today) }));
  const consolidated = balances.filter((b) => b.acc.currency === "EUR").reduce((s, b) => s + b.bal, 0);

  const recent = [...data.transactions].filter((t) => t.date <= today).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 45);
  const upcoming = plannedOccurrences(data.recurrences, new Set(data.accounts.map((a) => a.id)), today, horizon.toISOString().slice(0, 10))
    .filter((o) => !(o.internal && o.amount > 0))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);
  const accName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? "—";

  const pieData = cats.length > 7 ? [...cats.slice(0, 7), { name: "Autres catégories", value: cats.slice(7).reduce((s, c) => s + c.value, 0), color: "#CBD5E1", pct: 0 }] : cats;
  const chartData = months.map((m) => ({ name: MONTHS[m.month], Revenus: m.inc, Dépenses: m.exp, Net: m.net }));
  const hasYearData = yearTx.length > 0;

  const recapMk = shiftMonth(monthPrefix, -1);
  const recap = useMemo(() => computeRecap(data, recapMk), [data, recapMk]);
  const budgetAlerts = budgetStatuses(data, monthPrefix).filter((b) => b.level !== "ok").sort((a, b) => b.ratio - a.ratio);

  const pauseRec = (id: string) => {
    const r = data.recurrences.find((x) => x.id === id);
    if (!r) return;
    saveRecurrence({ ...r, status: "paused" });
    toast.success(`« ${r.name} » mise en pause`);
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 animate-rise">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{scopeLabel(data.accounts, accountFilter)} · {year}</p>
          <h1 data-testid="page-title" className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Tableau de bord
          </h1>
        </div>
        <p className="text-sm text-slate-500">{new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
      </div>
      <TodayOverview />
      <GlobalFilters />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:gap-5">
        <StatCard className="xl:col-span-4" testid="kpi-consolidated-card" tone="dark" label="Solde total consolidé" value={money(consolidated)} icon={<Landmark className="size-4" />} sub="Aujourd'hui, tous comptes EUR">
          <div className="mt-4 space-y-1.5 border-t border-white/10 pt-3" data-testid="consolidated-breakdown">
            {balances.map(({ acc, bal }) => (
              <Link key={acc.id} to={`/comptes/${acc.id}`} data-testid={`consolidated-account-${acc.id}`} className="-mx-1.5 flex items-center justify-between rounded-lg px-1.5 py-0.5 text-xs transition-colors hover:bg-white/10">
                <span className="flex items-center gap-2 text-slate-300">
                  <span className="size-2 rounded-full" style={{ background: acc.color }} />
                  {acc.name}
                </span>
                <span className="font-semibold tabular text-white">{money(bal, acc.currency)}</span>
              </Link>
            ))}
          </div>
        </StatCard>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:col-span-8 xl:gap-5">
          <StatCard testid="kpi-income-card" tone="income" label="Revenus de l'année" value={money(totals.inc)} icon={<ArrowDownRight className="size-4 text-emerald-700" />} sub={includeInternal ? "Virements internes inclus" : "Revenus réels"} />
          <StatCard testid="kpi-expense-card" tone="expense" label="Dépenses de l'année" value={money(totals.exp)} icon={<ArrowUpRight className="size-4 text-rose-700" />} sub={includeInternal ? "Virements internes inclus" : "Dépenses réelles"} />
          <StatCard testid="kpi-net-card" tone="net" label="Solde net de l'année" value={money(totals.net, "EUR", true)} icon={<Scale className="size-4 text-blue-700" />} sub={totals.net >= 0 ? "Vous dépensez moins que vous ne gagnez" : "Année déficitaire pour l'instant"} />
          <StatCard testid="kpi-month-card" tone="plain" label={`Ce mois-ci · ${MONTHS_LONG[Number(monthPrefix.slice(5)) - 1]}`} value={money(thisMonth.net, "EUR", true)} icon={<Wallet className="size-4 text-slate-700" />} sub={`${money(thisMonth.inc)} entrés · ${money(thisMonth.exp)} sortis`} />
        </div>
      </div>

      {recap.txCount > 0 && (
        <button
          data-testid="dashboard-recap-card"
          onClick={() => openRecap(recapMk)}
          className="mt-5 flex w-full flex-wrap items-center gap-x-6 gap-y-2 rounded-3xl border border-slate-200/60 bg-white p-4 pl-5 text-left shadow-[0_4px_24px_-8px_rgba(15,23,42,0.06)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-md animate-rise"
        >
          <span className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-slate-900 text-white">
              <CalendarCheck className="size-4" />
            </span>
            <span>
              <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Bilan du mois écoulé</span>
              <span className="block font-bold text-slate-900">{MONTHS_LONG[Number(recapMk.slice(5)) - 1]} {recapMk.slice(0, 4)}</span>
            </span>
          </span>
          <span className="text-sm text-slate-600">
            Net <b className={cn("tabular", recap.cur.net >= 0 ? "text-emerald-700" : "text-rose-700")}>{money(recap.cur.net, "EUR", true)}</b>
          </span>
          {recap.budgets.length > 0 && (
            <span className="text-sm text-slate-600">
              Budgets tenus <b className="text-slate-900">{recap.budgets.filter((b) => b.held).length}/{recap.budgets.length}</b>
            </span>
          )}
          <span className="text-sm text-slate-600">
            Épargne <b className="tabular text-slate-900">{money(recap.savings.end - recap.savings.start, "EUR", true)}</b>
          </span>
          <span className="ml-auto text-sm font-semibold text-slate-900">Voir le bilan →</span>
        </button>
      )}

      {budgetAlerts.length > 0 && (
        <div data-testid="dashboard-budget-alerts" className="mt-5 flex flex-wrap items-center gap-2 rounded-3xl border border-amber-200/70 bg-amber-50/60 p-3 pl-4 animate-rise">
          <span className="text-sm font-semibold text-amber-900">Budgets de {MONTHS_LONG[Number(monthPrefix.slice(5)) - 1].toLowerCase()} :</span>
          {budgetAlerts.map((b) => (
            <span key={b.budget.id} data-testid="dashboard-budget-alert" className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", LEVEL_STYLES[b.level].chip)}>
              {b.budget.category} · {Math.round(b.ratio * 100)} %
            </span>
          ))}
          <Link to="/budgets" data-testid="dashboard-budgets-link" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "ml-auto text-xs")}>
            Voir les budgets
          </Link>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Panel className="xl:col-span-8" testid="monthly-chart-panel">
          <PanelTitle sub="Revenus, dépenses et résultat net par mois">Mouvements de l'année</PanelTitle>
          {hasYearData ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF0EC" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }} tickFormatter={(v: number) => compact(v)} width={70} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "#F1F5F9" }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Revenus" fill="#34D399" radius={[6, 6, 0, 0]} maxBarSize={22} animationDuration={800} />
                  <Bar dataKey="Dépenses" fill="#FB7185" radius={[6, 6, 0, 0]} maxBarSize={22} animationDuration={800} />
                  <Line dataKey="Net" stroke="#1E3A8A" strokeWidth={2.5} dot={{ r: 3 }} type="monotone" animationDuration={800} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title={`Aucune opération en ${year}`} text="Ajoutez une opération ou changez d'année pour voir le graphique." />
          )}
        </Panel>

        <Panel className="xl:col-span-4" testid="category-donut-panel">
          <PanelTitle sub="Où va votre argent cette année">Répartition des dépenses</PanelTitle>
          {cats.length ? (
            <>
              <div className="relative h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="none" animationDuration={800}>
                      {pieData.map((c) => (
                        <Cell key={c.name} fill={c.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-400">Total</p>
                    <p className="text-lg font-extrabold tabular text-slate-900">{money(totals.exp)}</p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <EmptyState title="Pas encore de dépenses" />
          )}
        </Panel>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Panel className="xl:col-span-4" testid="top-categories-panel">
          <PanelTitle sub="Les quatre premières mises en avant">Principales catégories</PanelTitle>
          {cats.length ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                {cats.slice(0, 4).map((c, i) => (
                  <div key={c.name} data-testid={`top-category-${i}`} className="rounded-2xl p-3.5" style={{ background: c.color + "14" }}>
                    <div className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-full" style={{ background: c.color }} />
                      <span className="truncate text-xs font-semibold text-slate-700">{c.name}</span>
                    </div>
                    <p className="mt-2 text-lg font-extrabold tabular text-slate-900">{money(c.value)}</p>
                    <p className="text-[11px] text-slate-500">{Math.round(c.pct * 100)} % des dépenses</p>
                  </div>
                ))}
              </div>
              <ul className="mt-4 space-y-2.5">
                {cats.slice(4, 10).map((c) => (
                  <li key={c.name} className="flex items-center gap-3 text-sm">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: c.color }} />
                    <span className="flex-1 truncate text-slate-600">{c.name}</span>
                    <span className="w-16 text-right text-xs text-slate-400 tabular">{(c.pct * 100).toFixed(1)} %</span>
                    <span className="w-24 text-right font-semibold tabular text-slate-800">{money(c.value)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState title="Aucune catégorie de dépenses" />
          )}
        </Panel>

        <Panel className="xl:col-span-5" testid="recent-transactions-panel">
          <PanelTitle
            sub="Tous comptes confondus"
            aside={
              <Link to="/operations" data-testid="see-all-operations-link" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-xs")}>
                Tout voir
              </Link>
            }
          >
            Dernières opérations
          </PanelTitle>
          {recent.length ? (
            <ul className="divide-y divide-slate-100">
              {recent.map((t) => (
                <li key={t.id} data-testid="recent-transaction-item" className="flex items-center gap-3 py-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl text-xs font-bold text-white" style={{ background: data.categories.find((c) => c.name === t.category)?.color ?? "#94A3B8" }}>
                    {t.description.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{t.description}</p>
                    <p className="truncate text-xs text-slate-500">
                      {fmtDate(t.date)} · {accName(t.accountId)} · {t.category}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Amount value={t.amount} currency={t.currency} type={t.type} className="text-sm" />
                    {t.internal && <TypeBadge type={t.type} />}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Aucune opération" text="Commencez par ajouter une opération." />
          )}
        </Panel>

        <Panel className="xl:col-span-3" testid="upcoming-recurring-panel">
          <PanelTitle
            sub="45 prochains jours"
            aside={
              <Link to="/recurrences" data-testid="manage-recurrences-link" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-xs")}>
                Gérer
              </Link>
            }
          >
            Prochaines échéances
          </PanelTitle>
          {upcoming.length ? (
            <ul className="space-y-2.5">
              {upcoming.map((o, i) => (
                <li key={o.recurrenceId + o.date} data-testid={`upcoming-item-${i}`} className="group rounded-2xl border border-slate-100 bg-slate-50/60 p-3 transition-colors hover:bg-white">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{o.name}</p>
                      <p className="flex items-center gap-1 text-xs text-slate-500">
                        <CalendarClock className="size-3" /> {fmtDate(o.date)}
                        {o.internal && <span data-testid={`upcoming-transfer-${i}`}> · virement auto vers {accName(data.recurrences.find((r) => r.id === o.recurrenceId)?.toAccountId ?? "")}</span>}
                      </p>
                    </div>
                    <Amount value={o.amount} className="text-sm" />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-0.5">
                    <button data-testid={`upcoming-pause-${i}`} onClick={() => pauseRec(o.recurrenceId)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-200/70">
                      <Pause className="size-3" /> Pause
                    </button>
                    <button data-testid={`upcoming-edit-${i}`} onClick={() => navigate(`/recurrences?edit=${o.recurrenceId}`)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-200/70">
                      <Pencil className="size-3" /> Modifier
                    </button>
                    <button data-testid={`upcoming-stop-${i}`} onClick={() => setStopRec(data.recurrences.find((r) => r.id === o.recurrenceId) ?? null)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-rose-600 transition-colors hover:bg-rose-100/70">
                      <Square className="size-3" /> Arrêter
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Aucune échéance à venir" text="Créez une récurrence pour anticiper vos dépenses." />
          )}
        </Panel>
      </div>

      <ConfirmDialog
        open={!!stopRec}
        onOpenChange={(o) => !o && setStopRec(null)}
        title="Arrêter cette récurrence ?"
        description={`« ${stopRec?.name} » ne générera plus d'opérations. Les opérations déjà créées sont conservées.`}
        confirmLabel="Arrêter"
        onConfirm={() => {
          if (stopRec) saveRecurrence({ ...stopRec, status: "ended" });
          toast.success("Récurrence arrêtée");
        }}
      />
    </div>
  );
}
