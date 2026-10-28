import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, ListOrdered } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Amount, Chip, ChartTooltip, EmptyState, NativeSelect, Panel, PanelTitle, StatCard } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { setPrefs, useData, usePrefs } from "@/lib/store";
import { accountBalance, balanceSeries, catColor } from "@/lib/analytics";
import { ACCOUNT_TYPE_LABELS, compact, fmtDate, money, MONTHS, round2, todayIso } from "@/lib/format";
import { yearOptions } from "@/lib/ui";
import { cn } from "@/lib/utils";
import PocketGoalPanel from "@/components/PocketGoal";

function FlowList({ title, sub, items, testid, empty }: { title: string; sub: string; items: { name: string; value: number; color: string; count: number }[]; testid: string; empty: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <Panel testid={testid}>
      <PanelTitle sub={sub}>{title}</PanelTitle>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((i) => (
            <li key={i.name} data-testid={`${testid}-item`}>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-700">
                  <span className="size-2.5 rounded-full" style={{ background: i.color }} />
                  {i.name}
                  <span className="text-xs text-slate-400">· {i.count} op.</span>
                </span>
                <span className="font-semibold tabular text-slate-900">{money(i.value)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(i.value / max) * 100}%`, background: i.color }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default function AccountDetail() {
  const { id } = useParams();
  const data = useData();
  const { year } = usePrefs();
  const acc = data.accounts.find((a) => a.id === id);
  const today = todayIso();
  const from = `${year}-01-01`;
  const to = `${year}-12-31` < today ? `${year}-12-31` : today;

  const yearTx = useMemo(() => (acc ? data.transactions.filter((t) => t.accountId === acc.id && t.date.startsWith(String(year))) : []), [acc, data.transactions, year]);
  const series = useMemo(() => (acc && to >= from ? balanceSeries(acc, data.transactions, from, to) : []), [acc, data.transactions, from, to]);

  if (!acc)
    return (
      <Panel>
        <EmptyState title="Compte introuvable" action={<Link to="/comptes" className={buttonVariants()}>Retour aux comptes</Link>} />
      </Panel>
    );

  const accName = (aid?: string) => data.accounts.find((a) => a.id === aid)?.name ?? "Compte non identifié";
  const accColor = (aid?: string) => data.accounts.find((a) => a.id === aid)?.color ?? "#94A3B8";
  const sum = (pred: (t: (typeof yearTx)[number]) => boolean) => round2(yearTx.filter(pred).reduce((s, t) => s + Math.abs(t.amount), 0));
  const tIn = sum((t) => t.type === "transfer_in");
  const tOut = sum((t) => t.type === "transfer_out");
  const spent = round2(yearTx.filter((t) => t.type === "expense").reduce((s, t) => s - t.amount, 0));
  const earned = round2(yearTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0));
  const balance = accountBalance(acc, data.transactions, today);
  const parent = acc.parentId ? data.accounts.find((a) => a.id === acc.parentId) : undefined;

  const monthly = MONTHS.map((m, i) => {
    const mk = `${year}-${String(i + 1).padStart(2, "0")}`;
    const txs = yearTx.filter((t) => t.date.startsWith(mk));
    return {
      name: m,
      "Transferts entrants": round2(txs.filter((t) => t.type === "transfer_in").reduce((s, t) => s + t.amount, 0)),
      "Transferts sortants": round2(txs.filter((t) => t.type === "transfer_out").reduce((s, t) => s - t.amount, 0)),
      Dépenses: round2(txs.filter((t) => t.type === "expense").reduce((s, t) => s - t.amount, 0)),
      Revenus: round2(txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0)),
    };
  });

  const group = (type: "transfer_in" | "transfer_out") => {
    const m = new Map<string, { value: number; count: number; color: string }>();
    for (const t of yearTx.filter((x) => x.type === type)) {
      const name = accName(t.counterpartAccountId);
      const cur = m.get(name) ?? { value: 0, count: 0, color: accColor(t.counterpartAccountId) };
      cur.value += Math.abs(t.amount);
      cur.count++;
      m.set(name, cur);
    }
    return [...m.entries()].map(([name, v]) => ({ name, ...v, value: round2(v.value) })).sort((a, b) => b.value - a.value);
  };
  const expenseCats = (() => {
    const m = new Map<string, { value: number; count: number }>();
    for (const t of yearTx.filter((x) => x.type === "expense")) {
      const cur = m.get(t.category) ?? { value: 0, count: 0 };
      cur.value -= t.amount;
      cur.count++;
      m.set(t.category, cur);
    }
    return [...m.entries()].map(([name, v]) => ({ name, value: round2(v.value), count: v.count, color: catColor(data.categories, name) })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 6);
  })();
  const transfers = yearTx.filter((t) => t.type === "transfer_in" || t.type === "transfer_out").sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const chartSeries = series.map((p) => ({ ...p, label: fmtDate(p.date), Solde: p.balance }));

  return (
    <div>
      <Link to="/comptes" data-testid="account-back-link" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900">
        <ArrowLeft className="size-4" /> Comptes & Pockets
      </Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div className="flex items-center gap-4">
          <span className="grid size-14 place-items-center rounded-3xl text-xl font-extrabold text-white shadow-sm" style={{ background: acc.color }}>
            {acc.name.replace(/^IMP:\s*/, "").slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {ACCOUNT_TYPE_LABELS[acc.type]}
              {parent && ` · sous-compte de ${parent.name}`}
            </p>
            <h1 data-testid="page-title" className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              {acc.name}
            </h1>
          </div>
          {acc.archived && <Chip className="bg-slate-100 text-slate-600 ring-slate-200">Archivé</Chip>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect testid="account-year-select" ariaLabel="Année" value={String(year)} onChange={(v) => setPrefs({ year: Number(v) })} options={yearOptions(data)} />
          <Link to={`/operations?account=${acc.id}`} data-testid="account-operations-link" className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-xl")}>
            <ListOrdered /> Voir les opérations
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard className="sm:col-span-2 xl:col-span-1" testid="account-balance-card" tone="dark" label="Solde actuel" value={money(balance, acc.currency)} sub={`Ouverture : ${money(acc.openingBalance, acc.currency)}`} />
        <StatCard testid="account-transfer-in-card" tone="net" label={`Transferts entrants ${year}`} value={money(tIn, acc.currency)} icon={<ArrowDownLeft className="size-4 text-blue-700" />} sub={`${yearTx.filter((t) => t.type === "transfer_in").length} virements reçus`} />
        <StatCard testid="account-transfer-out-card" tone="plain" label={`Transferts sortants ${year}`} value={money(tOut, acc.currency)} icon={<ArrowUpRight className="size-4 text-indigo-700" />} sub={`${yearTx.filter((t) => t.type === "transfer_out").length} virements envoyés`} />
        <StatCard testid="account-expense-card" tone="expense" label={`Dépenses ${year}`} value={money(spent, acc.currency)} sub="Dépenses réelles" />
        <StatCard testid="account-income-card" tone="income" label={`Revenus ${year}`} value={money(earned, acc.currency)} sub="Revenus réels" />
      </div>

      {acc.type === "pocket" && <PocketGoalPanel acc={acc} />}

      {yearTx.length === 0 && series.length <= 2 ? (
        <Panel className="mt-5">
          <EmptyState testid="account-empty" title={`Aucune opération en ${year}`} text="Ce compte n'a pas encore de mouvement sur cette année." />
        </Panel>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Panel testid="account-balance-chart">
              <PanelTitle sub={`Solde jour après jour en ${year}`}>Évolution du solde</PanelTitle>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartSeries} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="accFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={acc.color} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={acc.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEF0EC" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748B" }} minTickGap={40} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }} tickFormatter={(v: number) => compact(v)} width={70} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area dataKey="Solde" type="stepAfter" stroke={acc.color} strokeWidth={2.5} fill="url(#accFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel testid="account-monthly-chart">
              <PanelTitle sub="Transferts internes et dépenses par mois">Entrées et sorties mensuelles</PanelTitle>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthly} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEF0EC" vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }} tickFormatter={(v: number) => compact(v)} width={70} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "#F1F5F9" }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Transferts entrants" fill="#60A5FA" radius={[5, 5, 0, 0]} maxBarSize={14} />
                    <Bar dataKey="Transferts sortants" fill="#818CF8" radius={[5, 5, 0, 0]} maxBarSize={14} />
                    <Bar dataKey="Dépenses" fill="#FB7185" radius={[5, 5, 0, 0]} maxBarSize={14} />
                    {earned > 0 && <Bar dataKey="Revenus" fill="#34D399" radius={[5, 5, 0, 0]} maxBarSize={14} />}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
            <FlowList testid="account-sources" title="D'où vient l'argent" sub="Transferts entrants par compte d'origine" items={group("transfer_in")} empty="Aucun transfert entrant cette année." />
            <FlowList testid="account-destinations" title="Où part l'argent" sub="Transferts sortants par compte de destination" items={group("transfer_out")} empty="Aucun transfert sortant cette année." />
            <FlowList testid="account-expense-categories" title="Dépenses par catégorie" sub="Les 6 premières catégories" items={expenseCats} empty="Aucune dépense réelle sur ce compte." />
          </div>

          <Panel className="mt-5" testid="account-transfers-panel">
            <PanelTitle sub={`${transfers.length} transferts internes en ${year}`}>Transferts entrants et sortants</PanelTitle>
            {transfers.length === 0 ? (
              <EmptyState title="Aucun transfert interne" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {transfers.slice(0, 20).map((t) => (
                  <li key={t.id} data-testid="account-transfer-item" className="flex items-center gap-3 py-2.5">
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", t.type === "transfer_in" ? "bg-blue-50 text-blue-700" : "bg-indigo-50 text-indigo-700")}>
                      {t.type === "transfer_in" ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {t.type === "transfer_in" ? "Depuis" : "Vers"} {accName(t.counterpartAccountId)}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {fmtDate(t.date)} · {t.description}
                      </p>
                    </div>
                    <Amount value={t.amount} currency={t.currency} type={t.type} className="text-sm" />
                  </li>
                ))}
              </ul>
            )}
            {transfers.length > 20 && (
              <Link to={`/operations?account=${acc.id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mt-2")}>
                Voir les {transfers.length - 20} autres dans Opérations
              </Link>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
