import { useEffect, useMemo, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, PiggyBank, Target, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { setPrefs, useData, usePrefs } from "@/lib/store";
import { closeRecap, openRecap, useRecapDialog } from "@/lib/ui";
import { computeRecap } from "@/lib/insights";
import { shiftMonth } from "@/lib/budgets";
import { money, MONTHS_LONG, todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";

const label = (mk: string) => `${MONTHS_LONG[Number(mk.slice(5, 7)) - 1]} ${mk.slice(0, 4)}`;

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
        {icon} {title}
      </p>
      {children}
    </div>
  );
}

export default function MonthlyRecapDialog() {
  const data = useData();
  const prefs = usePrefs();
  const { open, mk } = useRecapDialog();
  const currentMk = todayIso().slice(0, 7);
  const prevMk = shiftMonth(currentMk, -1);

  // Ouverture automatique à la 1re visite du mois
  useEffect(() => {
    if (prefs.lastRecapSeen === prevMk) return;
    if (!data.transactions.some((t) => t.date.startsWith(prevMk))) return;
    const id = setTimeout(() => openRecap(prevMk), 900);
    return () => clearTimeout(id);
  }, [prefs.lastRecapSeen, prevMk, data.transactions]);

  const r = useMemo(() => (mk ? computeRecap(data, mk) : null), [data, mk]);
  const close = () => {
    closeRecap();
    if (prefs.lastRecapSeen !== prevMk) setPrefs({ lastRecapSeen: prevMk });
  };
  if (!r) return null;
  const delta = r.cur.net - r.prev.net;
  const held = r.budgets.filter((b) => b.held).length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent data-testid="monthly-recap-dialog" className="max-h-[92vh] overflow-y-auto rounded-3xl bg-[#F7F8F5] p-0 sm:max-w-2xl">
        <div className="rounded-t-3xl bg-slate-900 p-6 text-white">
          <DialogHeader>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Bilan du mois</p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon-sm" aria-label="Mois précédent" data-testid="recap-prev-month" className="text-white hover:bg-white/10 hover:text-white" onClick={() => openRecap(shiftMonth(mk, -1))}>
                <ChevronLeft />
              </Button>
              <DialogTitle data-testid="recap-month-label" className="text-2xl font-extrabold tracking-tight">
                {label(mk)}
              </DialogTitle>
              <Button variant="ghost" size="icon-sm" aria-label="Mois suivant" data-testid="recap-next-month" disabled={mk >= currentMk} className="text-white hover:bg-white/10 hover:text-white" onClick={() => openRecap(shiftMonth(mk, 1))}>
                <ChevronRight />
              </Button>
            </div>
            <DialogDescription className="text-slate-400">{r.txCount} opérations · dépenses et revenus réels (hors virements internes)</DialogDescription>
          </DialogHeader>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-400">Revenus</p>
              <p data-testid="recap-income" className="text-xl font-extrabold tabular text-emerald-300">{money(r.cur.inc)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-400">Dépenses</p>
              <p data-testid="recap-expense" className="text-xl font-extrabold tabular text-rose-300">{money(r.cur.exp)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-400">Résultat net</p>
              <p data-testid="recap-net" className="text-xl font-extrabold tabular">{money(r.cur.net, "EUR", true)}</p>
              <p className={cn("mt-0.5 flex items-center gap-1 text-[11px]", delta >= 0 ? "text-emerald-300" : "text-rose-300")}>
                {delta >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                {money(delta, "EUR", true)} vs mois précédent
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <Section icon={<Target className="size-4 text-amber-600" />} title={r.budgets.length ? `Budgets tenus : ${held} / ${r.budgets.length}` : "Budgets"}>
            {r.budgets.length === 0 ? (
              <p className="text-xs text-slate-500">Aucun budget défini.</p>
            ) : (
              <ul className="space-y-1.5" data-testid="recap-budgets">
                {r.budgets.map((b) => (
                  <li key={b.category} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className={cn("grid size-4 place-items-center rounded-full text-[9px] font-bold text-white", b.held ? "bg-emerald-500" : "bg-rose-500")}>{b.held ? "✓" : "!"}</span>
                      {b.category}
                    </span>
                    <span className="tabular text-slate-600">
                      {money(b.spent)} / {money(b.limit)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section icon={<TrendingDown className="size-4 text-rose-500" />} title="Principales dépenses">
            {r.topCats.length === 0 ? (
              <p className="text-xs text-slate-500">Aucune dépense.</p>
            ) : (
              <ul className="space-y-1.5">
                {r.topCats.map((c) => (
                  <li key={c.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: c.color }} />
                      {c.name}
                    </span>
                    <span className="font-semibold tabular">{money(c.value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section icon={<WalletCards className="size-4 text-blue-600" />} title="Pockets alimentées">
            {r.pockets.length === 0 ? (
              <p className="text-xs text-slate-500">Aucun mouvement sur les Pockets.</p>
            ) : (
              <ul className="space-y-1.5" data-testid="recap-pockets">
                {r.pockets.map((p) => (
                  <li key={p.acc.id} className="text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-slate-800">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: p.acc.color }} />
                      {p.acc.name}
                    </span>
                    <span className="block pl-3.5 tabular text-slate-600">
                      <span className="text-blue-700">+{money(p.tIn)}</span> · <span className="text-indigo-700">−{money(p.tOut)}</span> · solde {money(p.end)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section icon={<PiggyBank className="size-4 text-amber-600" />} title="Épargne">
            <dl className="space-y-1.5 text-xs" data-testid="recap-savings">
              <div className="flex justify-between">
                <dt className="text-slate-500">Solde</dt>
                <dd className="font-semibold tabular">
                  {money(r.savings.start)} → {money(r.savings.end)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Versements / retraits</dt>
                <dd className="tabular">
                  +{money(r.savings.deposits)} / −{money(r.savings.withdrawals)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Intérêts</dt>
                <dd className="tabular text-emerald-700">+{money(r.savings.interest)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Alloué aux objectifs</dt>
                <dd className="tabular">{money(r.savings.allocated, "EUR", true)}</dd>
              </div>
            </dl>
          </Section>
        </div>
        <div className="flex justify-end px-5 pb-5">
          <Button data-testid="recap-close-button" onClick={close} className="rounded-xl">
            Compris
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
