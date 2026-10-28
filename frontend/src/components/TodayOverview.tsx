import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CalendarClock, Compass, PieChart, Wallet } from "lucide-react";
import { useData, usePrefs } from "@/lib/store";
import { cashflow } from "@/lib/cashflow";
import { accountBalance, catColor, flow } from "@/lib/analytics";
import { budgetStatuses } from "@/lib/budgets";
import { plannedOf } from "@/lib/goals";
import { money, round2, todayIso } from "@/lib/format";
import { CashAlert, CashChart, cashOptions, longDate } from "@/pages/Cashflow";
import { ProgressBar } from "@/components/kit";
import { cn } from "@/lib/utils";

function Q({ n, title, icon, children, testid, to }: { n: number; title: string; icon: ReactNode; children: ReactNode; testid: string; to?: string }) {
  return (
    <div data-testid={testid} className="flex flex-col rounded-3xl border border-slate-200/60 bg-white p-5 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.06)] animate-rise">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-xl bg-slate-900 text-white">{icon}</span>
        <p className="text-sm font-bold text-slate-900">
          <span className="mr-1 text-slate-400">{n}.</span>
          {title}
        </p>
        {to && (
          <Link to={to} className="ml-auto text-slate-400 transition-colors hover:text-slate-900" aria-label="Voir le détail">
            <ArrowRight className="size-4" />
          </Link>
        )}
      </div>
      <div className="flex-1 space-y-2 text-sm">{children}</div>
    </div>
  );
}

function Row({ label, value, testid, tone }: { label: string; value: string; testid: string; tone?: "neg" | "pos" | "muted" }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-slate-500">{label}</span>
      <span data-testid={testid} className={cn("font-semibold tabular", tone === "neg" ? "text-rose-700" : tone === "pos" ? "text-emerald-700" : tone === "muted" ? "text-slate-500" : "text-slate-900")}>
        {value}
      </span>
    </div>
  );
}

/** Tableau de bord : disponible aujourd'hui, où va l'argent, ce qui arrive, suis-je dans les clous. */
export default function TodayOverview() {
  const data = useData();
  const prefs = usePrefs();
  const today = todayIso();
  const mk = today.slice(0, 7);
  const opts = cashOptions(data, prefs, mk);
  const r = useMemo(() => cashflow(data, opts, today), [data, opts.scope, opts.includeVariable, opts.variableMonthly, opts.includeGoalSavings, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const savingsReal = round2(data.accounts.filter((a) => a.type === "savings").reduce((s, a) => s + accountBalance(a, data.transactions, today), 0));
  const allocated = round2(data.goals.filter((g) => g.status !== "abandoned").reduce((s, g) => s + g.allocated, 0));
  const unallocated = round2(savingsReal - allocated);
  const toAllocate = round2(
    data.goals.filter((g) => g.status === "active").reduce((s, g) => s + Math.max(0, plannedOf(g) - g.history.filter((h) => h.amount > 0 && h.date.startsWith(mk)).reduce((a, h) => a + h.amount, 0)), 0),
  );

  const eur = new Set(data.accounts.filter((a) => a.currency === "EUR").map((a) => a.id));
  const cats = new Map<string, number>();
  let spent = 0;
  for (const t of data.transactions) {
    if (!eur.has(t.accountId) || !t.date.startsWith(mk) || t.date > today) continue;
    const e = flow(t, false).exp;
    if (!e) continue;
    spent += e;
    cats.set(t.category, (cats.get(t.category) ?? 0) + e);
  }
  const top = [...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

  const upcoming = r.days.filter((d) => !d.actual || d.date === today).flatMap((d) => d.events.filter((e) => e.amount < 0)).slice(0, 4);
  const nextIncome = r.days.flatMap((d) => d.events).find((e) => e.amount > 0 && e.kind === "income");

  const budgets = budgetStatuses(data, mk);
  const bSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const bLimit = budgets.reduce((s, b) => s + b.limit, 0);

  return (
    <section className="mb-6" data-testid="today-overview">
      {r.firstNegative && (
        <div className="mb-4">
          <CashAlert r={r} testid="dashboard-cash-alert" />
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Q n={1} title="Combien ai-je aujourd'hui ?" icon={<Wallet className="size-4" />} testid="q-available" to="/tresorerie">
          <p className="text-3xl font-extrabold tracking-tight tabular text-slate-900" data-testid="q-available-value">
            {money(r.availableToday)}
          </p>
          <p className="text-xs text-slate-500">Disponible aujourd'hui · {opts.scope === "cash" ? "compte principal + Pockets" : data.accounts.find((a) => a.id === opts.scope)?.name}</p>
          <Row label="Épargne réelle" value={money(savingsReal)} testid="q-savings-real" />
          <Row label="Épargne non allouée" value={money(unallocated)} testid="q-unallocated" tone={unallocated < 0 ? "neg" : undefined} />
        </Q>
        <Q n={2} title="Où va mon argent ?" icon={<PieChart className="size-4" />} testid="q-where" to="/analyse">
          <Row label="Dépensé ce mois-ci" value={money(round2(spent))} testid="q-spent-month" />
          <ul className="space-y-1.5 pt-1">
            {top.map(([name, v]) => (
              <li key={name}>
                <div className="flex justify-between text-xs">
                  <span className="truncate text-slate-600">{name}</span>
                  <span className="font-semibold tabular text-slate-800">{money(v)}</span>
                </div>
                <ProgressBar value={spent ? v / spent : 0} color={catColor(data.categories, name)} />
              </li>
            ))}
            {!top.length && <li className="text-xs text-slate-400">Aucune dépense ce mois-ci.</li>}
          </ul>
        </Q>
        <Q n={3} title="Qu'est-ce qui arrive ?" icon={<CalendarClock className="size-4" />} testid="q-next" to="/recurrences">
          {nextIncome ? <Row label={`Prochain revenu · ${longDate(nextIncome.date)}`} value={money(nextIncome.amount)} testid="q-next-income" tone="pos" /> : <p className="text-xs text-slate-400">Aucun revenu prévu ce mois-ci.</p>}
          <ul className="space-y-1" data-testid="q-upcoming-list">
            {upcoming.map((e, i) => (
              <li key={i} className="flex justify-between gap-2 text-xs">
                <span className="truncate text-slate-600">
                  {longDate(e.date)} · {e.name}
                  {e.late && <b className="ml-1 text-rose-700">en retard</b>}
                </span>
                <span className="font-semibold tabular text-rose-700">{money(e.amount)}</span>
              </li>
            ))}
            {!upcoming.length && <li className="text-xs text-slate-400">Aucune échéance d'ici la fin du mois.</li>}
          </ul>
          <Row label="Épargne prévue à allouer" value={money(toAllocate)} testid="q-to-allocate" tone={toAllocate ? undefined : "muted"} />
        </Q>
        <Q n={4} title="Suis-je dans les clous ?" icon={<Compass className="size-4" />} testid="q-track" to="/tresorerie">
          {budgets.length > 0 && (
            <div>
              <Row label="Budgets du mois" value={`${money(round2(bSpent))} / ${money(round2(bLimit))}`} testid="q-budget-progress" />
              <ProgressBar value={bLimit ? bSpent / bLimit : 0} color={bSpent > bLimit ? "#E11D48" : bSpent > bLimit * 0.75 ? "#F59E0B" : "#10B981"} />
            </div>
          )}
          <Row label="Projeté fin de mois" value={money(r.endBalance)} testid="q-projected-end" tone={r.endBalance < 0 ? "neg" : undefined} />
          <Row label={`Solde projeté le plus bas · ${longDate(r.min.date)}`} value={money(r.min.balance)} testid="q-lowest" tone={r.min.balance < 0 ? "neg" : undefined} />
          <Row label="Report nécessaire" value={money(r.requiredCarryover)} testid="q-carryover" tone={r.requiredCarryover > 0 ? "neg" : "muted"} />
          {unallocated < -0.005 && (
            <p data-testid="q-overallocated" className="flex items-center gap-1.5 rounded-xl bg-rose-50 px-2.5 py-1.5 text-xs text-rose-800">
              <AlertTriangle className="size-3.5" /> Épargne sur-allouée de {money(-unallocated)}
            </p>
          )}
        </Q>
      </div>
      <div className="mt-4 rounded-3xl border border-slate-200/60 bg-white p-5 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.06)]" data-testid="dashboard-cash-chart">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-bold text-slate-900">Trésorerie du mois · réel puis projeté</p>
          <Link to="/tresorerie" className="text-xs font-semibold text-slate-600 hover:text-slate-900">
            Voir l'échéancier →
          </Link>
        </div>
        <CashChart r={r} height={190} />
      </div>
    </section>
  );
}
