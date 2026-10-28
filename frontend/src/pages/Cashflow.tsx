import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Banknote, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, PiggyBank, TrendingDown, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip, EmptyState, Field, NativeSelect, PageHeader, Panel, PanelTitle, StatCard, inputCls } from "@/components/kit";
import { saveRecurrence, setPrefs, useData, usePrefs } from "@/lib/store";
import { cashflow, detectSalary, type CashflowResult, type CashKind } from "@/lib/cashflow";
import { compact, fmtDate, money, MONTHS_LONG, round2, todayIso, uid } from "@/lib/format";
import { parseAmount } from "@/lib/csv";
import type { AppData, Prefs } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND: Record<CashKind, { label: string; cls: string }> = {
  income: { label: "Revenu", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  fixed: { label: "Charge fixe", cls: "bg-rose-50 text-rose-800 ring-rose-200" },
  savings: { label: "Épargne", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  transfer: { label: "Virement", cls: "bg-slate-100 text-slate-700 ring-slate-200" },
  goal: { label: "Objectifs", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
};

export const longDate = (iso: string) => `${Number(iso.slice(8))} ${MONTHS_LONG[Number(iso.slice(5, 7)) - 1].toLowerCase()}`;
const monthLabel = (mk: string) => `${MONTHS_LONG[Number(mk.slice(5)) - 1]} ${mk.slice(0, 4)}`;
const shiftMk = (mk: string, n: number) => {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** Options de trésorerie partagées (page + tableau de bord). */
export function cashOptions(data: AppData, prefs: Prefs, month: string) {
  const scope = prefs.cashScope && (prefs.cashScope === "cash" || data.accounts.some((a) => a.id === prefs.cashScope)) ? prefs.cashScope : "cash";
  const hasSavingsTransfer = data.recurrences.some((r) => r.type === "transfer" && r.status === "active" && data.accounts.find((a) => a.id === r.toAccountId)?.type === "savings");
  return {
    scope,
    month,
    includeVariable: prefs.cashIncludeVariable !== false,
    variableMonthly: prefs.cashVariable?.[scope],
    includeGoalSavings: prefs.cashGoalSavings ?? !hasSavingsTransfer,
  };
}

/** Message principal : négatif avant la paie ? */
export function cashMessage(r: CashflowResult): { tone: "danger" | "warn" | "ok"; text: string } {
  if (r.firstNegative) {
    const pay = r.payday ? ` avant l'arrivée du ${r.payday.name.toLowerCase().includes("salaire") ? "salaire" : `revenu « ${r.payday.name} »`} le ${longDate(r.payday.date)}` : "";
    const need = r.requiredCarryover > 0 ? ` Il vous faut ${money(r.requiredCarryover)} disponibles en début de mois pour couvrir les dépenses${pay}.` : "";
    return { tone: r.negativeBeforePayday ? "danger" : "warn", text: `Votre solde projeté devient négatif le ${longDate(r.firstNegative)}.${need}${r.shortfallNow > 0 ? ` Il manque ${money(r.shortfallNow)} au point le plus bas (${longDate(r.min.date)}).` : ""}` };
  }
  return { tone: "ok", text: `Aucun passage sous zéro prévu en ${monthLabel(r.month).toLowerCase()}. Point le plus bas : ${money(r.min.balance)} le ${longDate(r.min.date)}.` };
}

export function CashAlert({ r, testid = "cash-alert" }: { r: CashflowResult; testid?: string }) {
  const m = cashMessage(r);
  return (
    <div
      data-testid={testid}
      data-tone={m.tone}
      className={cn("flex items-start gap-3 rounded-2xl border p-4 text-sm animate-rise", m.tone === "danger" ? "border-rose-200 bg-rose-50 text-rose-950" : m.tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950")}
    >
      {m.tone === "ok" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" /> : <AlertTriangle className={cn("mt-0.5 size-5 shrink-0", m.tone === "danger" ? "text-rose-600" : "text-amber-600")} />}
      <p className="leading-relaxed">{m.text}</p>
    </div>
  );
}

export function CashChart({ r, height = 280 }: { r: CashflowResult; height?: number }) {
  const today = todayIso();
  const rows = r.days.map((d) => ({ name: d.date.slice(8), date: d.date, Solde: d.balance, past: d.actual }));
  const max = Math.max(0, ...rows.map((x) => x.Solde));
  const min = Math.min(0, ...rows.map((x) => x.Solde));
  const zero = max === min ? 0 : max / (max - min);
  return (
    <div style={{ height }} data-testid="cash-chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor="#10B981" stopOpacity={0.28} />
              <stop offset={zero} stopColor="#10B981" stopOpacity={0.06} />
              <stop offset={zero} stopColor="#F43F5E" stopOpacity={0.08} />
              <stop offset={1} stopColor="#F43F5E" stopOpacity={0.3} />
            </linearGradient>
            <linearGradient id="cashStroke" x1="0" y1="0" x2="0" y2="1">
              <stop offset={zero} stopColor="#059669" />
              <stop offset={zero} stopColor="#E11D48" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#EEF0EC" vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }} interval={2} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }} tickFormatter={(v: number) => compact(v)} width={64} />
          <Tooltip content={({ active, payload }) => (active && payload?.length ? <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg"><p className="font-semibold text-slate-700">{fmtDate(String(payload[0].payload.date))}{payload[0].payload.past ? " · réel" : " · projeté"}</p><p className="tabular">{money(Number(payload[0].value))}</p></div> : null)} />
          <ReferenceLine y={0} stroke="#94A3B8" strokeDasharray="4 4" />
          {r.isCurrent && <ReferenceLine x={today.slice(8)} stroke="#0F172A" strokeOpacity={0.35} label={{ value: "Aujourd'hui", fontSize: 10, fill: "#64748B", position: "insideTopRight" }} />}
          {r.payday && <ReferenceLine x={r.payday.date.slice(8)} stroke="#10B981" strokeDasharray="3 3" label={{ value: "Paie", fontSize: 10, fill: "#059669", position: "insideTopLeft" }} />}
          <Area type="stepAfter" dataKey="Solde" stroke="url(#cashStroke)" strokeWidth={2.5} fill="url(#cashFill)" />
          <ReferenceDot x={r.min.date.slice(8)} y={r.min.balance} r={5} fill={r.min.balance < 0 ? "#E11D48" : "#0F172A"} stroke="#fff" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function SalaryHint() {
  const data = useData();
  const s = detectSalary(data);
  if (data.recurrences.some((r) => r.type === "income" && r.status === "active" && /salaire|paie/i.test(`${r.name} ${r.category}`))) return null;
  const create = () => {
    if (!s) return;
    const t = new Date();
    let next = new Date(t.getFullYear(), t.getMonth(), Math.min(s.day, 28));
    if (next.toISOString().slice(0, 10) <= todayIso()) next = new Date(t.getFullYear(), t.getMonth() + 1, Math.min(s.day, 28));
    const iso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    saveRecurrence({ id: uid(), name: "Salaire", amount: s.amount, accountId: s.accountId, category: s.category, type: "income", frequency: "monthly", interval: 1, intervalUnit: "months", startDate: iso, nextDate: iso, endMode: "never", status: "active", manual: true, occurrences: 0, cumulated: 0, note: "Créée depuis la trésorerie — validation manuelle pour éviter les doublons avec vos imports." });
    toast.success("Récurrence « Salaire » créée", { description: `${money(s.amount)} le ${s.day} de chaque mois` });
  };
  return (
    <div data-testid="salary-hint" className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-950">
      <Banknote className="size-5 shrink-0 text-blue-600" />
      <p className="min-w-0 flex-1">Aucun salaire récurrent : la prévision ne connaît pas votre jour de paie. {s ? `Dernier salaire détecté : ${money(s.amount)} le ${s.day} du mois.` : "Ajoutez votre salaire dans les récurrences."}</p>
      {s ? (
        <Button size="sm" className="rounded-xl" data-testid="salary-create-button" onClick={create}>
          Créer la récurrence salaire
        </Button>
      ) : (
        <Link to="/recurrences" className="font-semibold underline">
          Récurrences
        </Link>
      )}
    </div>
  );
}

export default function Cashflow() {
  const data = useData();
  const prefs = usePrefs();
  const curMk = todayIso().slice(0, 7);
  const [month, setMonth] = useState(curMk);
  const opts = cashOptions(data, prefs, month);
  const r = useMemo(() => cashflow(data, opts), [data, opts.scope, opts.month, opts.includeVariable, opts.variableMonthly, opts.includeGoalSavings]); // eslint-disable-line react-hooks/exhaustive-deps
  const [variable, setVariable] = useState<string | null>(null);
  const scopes = [{ value: "cash", label: "Compte principal + Pockets" }, ...data.accounts.filter((a) => a.currency === "EUR" && !a.archived).map((a) => ({ value: a.id, label: a.name }))];
  const eventDays = r.days.filter((d) => d.events.length || (d.date === r.min.date && !d.actual));
  const saveVariable = () => {
    if (variable === null) return;
    const v = variable.trim() === "" ? null : parseAmount(variable);
    if (v !== null && v < 0) return toast.error("Montant invalide");
    const next = { ...(prefs.cashVariable ?? {}) };
    if (v === null) delete next[opts.scope];
    else next[opts.scope] = round2(v);
    setPrefs({ cashVariable: next });
    setVariable(null);
  };

  return (
    <div>
      <PageHeader eyebrow="Prévision jour par jour" title="Trésorerie" subtitle="Votre solde projeté chaque jour : revenus attendus (salaire en fin de mois, CAF…), prélèvements et charges récurrentes, virements vers l'épargne et dépenses variables estimées." />
      <SalaryHint />
      <div className="mb-5 flex flex-wrap items-end gap-3 animate-rise">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Mois précédent" data-testid="cash-prev-month" className="rounded-xl" disabled={month <= curMk} onClick={() => setMonth(shiftMk(month, -1))}>
            <ChevronLeft />
          </Button>
          <p data-testid="cash-month-label" className="min-w-40 text-center text-lg font-bold text-slate-900">
            {monthLabel(r.month)}
          </p>
          <Button variant="outline" size="icon" aria-label="Mois suivant" data-testid="cash-next-month" className="rounded-xl" disabled={month >= shiftMk(curMk, 5)} onClick={() => setMonth(shiftMk(month, 1))}>
            <ChevronRight />
          </Button>
        </div>
        <Field label="Périmètre">
          <NativeSelect testid="cash-scope-select" value={opts.scope} onChange={(v) => setPrefs({ cashScope: v })} options={scopes} className="min-w-56" />
        </Field>
        <Field label="Dépenses variables / mois" hint={`Estimation 3 mois : ${money(r.variableEstimated)}`}>
          <div className="flex gap-2">
            <Input data-testid="cash-variable-input" inputMode="decimal" disabled={!opts.includeVariable} value={variable ?? String(opts.variableMonthly ?? r.variableEstimated).replace(".", ",")} onChange={(e) => setVariable(e.target.value)} onBlur={saveVariable} onKeyDown={(e) => e.key === "Enter" && saveVariable()} className={cn(inputCls, "w-28")} />
          </div>
        </Field>
        <div className="flex flex-col gap-1.5 pb-1 text-xs text-slate-600">
          <label className="flex items-center gap-2">
            <Checkbox data-testid="cash-variable-toggle" checked={opts.includeVariable} onCheckedChange={(c) => setPrefs({ cashIncludeVariable: !!c })} /> Inclure les dépenses variables
          </label>
          <label className="flex items-center gap-2">
            <Checkbox data-testid="cash-goals-toggle" checked={opts.includeGoalSavings} onCheckedChange={(c) => setPrefs({ cashGoalSavings: !!c })} /> Réserver l'épargne prévue des objectifs le jour de paie
          </label>
        </div>
      </div>

      <CashAlert r={r} />

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard testid="cash-available-card" tone="dark" label={r.isCurrent ? "Disponible aujourd'hui" : "Solde projeté au 1er"} value={money(r.isCurrent ? r.availableToday : r.startBalance)} icon={<Wallet className="size-4" />} sub={r.isCurrent ? `Solde réel du périmètre` : "Report du mois précédent"} />
        <StatCard testid="cash-end-card" tone={r.endBalance < 0 ? "expense" : "net"} label="Projeté fin de mois" value={money(r.endBalance)} sub={`Au ${longDate(r.days[r.days.length - 1]?.date ?? todayIso())}`} />
        <StatCard testid="cash-min-card" tone={r.min.balance < 0 ? "expense" : "plain"} label="Solde projeté le plus bas" value={money(r.min.balance)} icon={<TrendingDown className="size-4 text-rose-600" />} sub={`Le ${longDate(r.min.date)}`} />
        <StatCard testid="cash-carryover-card" tone={r.requiredCarryover > 0 ? "savings" : "income"} label="Report nécessaire" value={money(r.requiredCarryover)} icon={<PiggyBank className="size-4 text-amber-700" />} sub="À avoir en début de mois pour ne jamais passer sous zéro" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel testid="cash-budget-panel" className="lg:col-span-1">
          <PanelTitle sub="Revenus et dépenses du mois">Budget du mois</PanelTitle>
          <dl className="space-y-2.5 text-sm">
            {[
              ["Revenus prévus", r.plannedIncome, "cash-planned-income"],
              ["Reçu", r.received, "cash-received"],
              ["Restant à recevoir", r.remainingIncome, "cash-remaining-income"],
              ["Dépenses prévues", -r.plannedExpenses, "cash-planned-expenses"],
              ["Déjà dépensé", -r.spent, "cash-spent"],
              ["Charges et épargne à venir", -r.remainingFixed, "cash-remaining-fixed"],
            ].map(([l, v, id]) => (
              <div key={String(id)} className="flex items-center justify-between">
                <dt className="text-slate-500">{l}</dt>
                <dd data-testid={String(id)} className={cn("font-semibold tabular", Number(v) < 0 ? "text-rose-700" : "text-slate-900")}>
                  {money(Number(v))}
                </dd>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
              <dt className="font-semibold text-slate-700">Solde du mois prévu</dt>
              <dd data-testid="cash-month-net" className={cn("font-extrabold tabular", r.plannedIncome - r.plannedExpenses < 0 ? "text-rose-700" : "text-emerald-700")}>
                {money(round2(r.plannedIncome - r.plannedExpenses), "EUR", true)}
              </dd>
            </div>
            {r.payday && (
              <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-900" data-testid="cash-payday">
                <CalendarClock className="size-3.5" /> Prochaine paie : {r.payday.name} · {money(r.payday.amount)} le {longDate(r.payday.date)}
              </p>
            )}
          </dl>
        </Panel>
        <Panel testid="cash-chart-panel" className="lg:col-span-2">
          <PanelTitle sub="Réel jusqu'à aujourd'hui, projeté ensuite">Solde jour par jour</PanelTitle>
          <CashChart r={r} />
        </Panel>
      </div>

      <Panel className="mt-5" testid="cash-timeline-panel">
        <PanelTitle sub="Chaque mouvement prévu et le solde qui en résulte">Échéancier</PanelTitle>
        {eventDays.length === 0 ? (
          <EmptyState title="Aucune échéance prévue" text="Ajoutez vos revenus et prélèvements dans les récurrences pour obtenir une prévision précise." />
        ) : (
          <ol className="relative space-y-2 border-l border-slate-200 pl-5">
            {eventDays.map((d) => (
              <li key={d.date} data-testid="cash-day" className="relative">
                <span className={cn("absolute -left-[26px] top-3 size-3 rounded-full ring-4 ring-white", d.balance < 0 ? "bg-rose-500" : "bg-slate-300")} />
                <div className={cn("rounded-2xl p-3", d.balance < 0 ? "bg-rose-50/70" : "bg-slate-50/70")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">
                      {fmtDate(d.date)}
                      {d.date === r.min.date && <Chip className="ml-2 bg-slate-900 text-white ring-slate-900">Point bas</Chip>}
                      {r.payday?.date === d.date && <Chip className="ml-2 bg-emerald-100 text-emerald-800 ring-emerald-200">Paie</Chip>}
                    </p>
                    <p data-testid="cash-day-balance" className={cn("text-sm font-bold tabular", d.balance < 0 ? "text-rose-700" : "text-slate-900")}>
                      {money(d.balance)}
                    </p>
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {d.events.map((e, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        {e.amount >= 0 ? <ArrowUpRight className="size-3.5 text-emerald-600" /> : <ArrowDownRight className="size-3.5 text-rose-600" />}
                        <span className="font-medium text-slate-800">{e.name}</span>
                        <Chip className={KIND[e.kind].cls}>{KIND[e.kind].label}</Chip>
                        {e.late && <Chip className="bg-rose-100 text-rose-800 ring-rose-200">En retard</Chip>}
                        <span className="ml-auto font-semibold tabular">{money(e.amount, "EUR", true)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        )}
        {opts.includeVariable && r.variableMonthly > 0 && <p className="mt-3 text-xs text-slate-500">Dépenses variables estimées réparties chaque jour : {money(r.variableMonthly)} / mois.</p>}
      </Panel>
    </div>
  );
}
