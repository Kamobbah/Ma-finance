import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CalendarRange, ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Plus, SlidersHorizontal, Target, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip, ConfirmDialog, EmptyState, Field, NativeSelect, PageHeader, Panel, PanelTitle, ProgressBar, StatCard, inputCls } from "@/components/kit";
import { deleteBudget, saveBudget, useData } from "@/lib/store";
import { averageSpent, budgetLimit, budgetStatuses, LEVEL_STYLES, levelOf, spentByCategory } from "@/lib/budgets";
import { catColor } from "@/lib/analytics";
import { money, MONTHS, MONTHS_LONG, round2, todayIso, uid } from "@/lib/format";
import { parseAmount } from "@/lib/csv";
import { INTERNAL_CATEGORY } from "@/lib/rules";
import type { Budget } from "@/lib/types";
import { cn } from "@/lib/utils";

const mkLabel = (mk: string) => `${MONTHS_LONG[Number(mk.slice(5, 7)) - 1]} ${mk.slice(0, 4)}`;
function shiftMonth(mk: string, delta: number) {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function NewBudgetDialog({ open, onClose, mk }: { open: boolean; onClose: () => void; mk: string }) {
  const data = useData();
  const available = data.categories.filter((c) => c.name !== INTERNAL_CATEGORY && !data.budgets.some((b) => b.category === c.name));
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  useEffect(() => {
    if (open) {
      setCategory(available[0]?.name ?? "");
      setAmount("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const avg = category ? averageSpent(data, category, mk) : 0;
  const submit = () => {
    const a = parseAmount(amount);
    if (!category) return toast.error("Choisissez une catégorie");
    if (a === null || a <= 0) return toast.error("Indiquez un plafond positif");
    saveBudget({ id: uid(), category, amount: round2(a), overrides: {} });
    toast.success(`Budget « ${category} » créé`);
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="budget-dialog" className="rounded-3xl p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Nouveau budget mensuel</DialogTitle>
          <DialogDescription>Plafond appliqué chaque mois ; vous pourrez l'ajuster mois par mois.</DialogDescription>
        </DialogHeader>
        <Field label="Catégorie">
          <NativeSelect testid="budget-category-select" value={category} onChange={setCategory} options={available.map((c) => ({ value: c.name, label: c.name }))} className="w-full" />
        </Field>
        <Field label="Plafond mensuel (€)" hint={avg ? `Moyenne des 3 derniers mois : ${money(avg)}` : "Pas de dépense sur les 3 derniers mois"}>
          <Input data-testid="budget-amount-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={avg ? String(Math.ceil(avg)) : "200"} className={inputCls} />
        </Field>
        {avg > 0 && (
          <button data-testid="budget-use-average" className="self-start text-xs font-semibold text-blue-700 hover:underline" onClick={() => setAmount(String(Math.ceil(avg)))}>
            Utiliser la moyenne ({money(Math.ceil(avg))})
          </button>
        )}
        <DialogFooter className="-mx-6 -mb-6 rounded-b-3xl px-6">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button data-testid="budget-save-button" onClick={submit}>
            Créer le budget
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LimitDialog({ target, onClose }: { target: { budget: Budget; mode: "default" | "month"; mk: string } | null; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  useEffect(() => {
    if (target) setAmount(String(target.mode === "default" ? target.budget.amount : budgetLimit(target.budget, target.mk)).replace(".", ","));
  }, [target]);
  if (!target) return null;
  const { budget, mode, mk } = target;
  const hasOverride = mk in budget.overrides;
  const submit = () => {
    const a = parseAmount(amount);
    if (a === null || a < 0) return toast.error("Montant invalide");
    if (mode === "default") saveBudget({ ...budget, amount: round2(a) });
    else saveBudget({ ...budget, overrides: { ...budget.overrides, [mk]: round2(a) } });
    toast.success(mode === "default" ? "Plafond par défaut modifié" : `Plafond de ${mkLabel(mk)} ajusté`);
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="limit-dialog" className="rounded-3xl p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{mode === "default" ? `Plafond par défaut · ${budget.category}` : `${budget.category} · ${mkLabel(mk)}`}</DialogTitle>
          <DialogDescription>{mode === "default" ? "S'applique à tous les mois sans ajustement spécifique." : `Plafond spécifique pour ce mois (par défaut : ${money(budget.amount)}).`}</DialogDescription>
        </DialogHeader>
        <Field label="Plafond (€)">
          <Input data-testid="limit-amount-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} autoFocus />
        </Field>
        <DialogFooter className="-mx-6 -mb-6 rounded-b-3xl px-6">
          {mode === "month" && hasOverride && (
            <Button
              variant="ghost"
              data-testid="limit-reset-button"
              className="mr-auto"
              onClick={() => {
                const rest = { ...budget.overrides };
                delete rest[mk];
                saveBudget({ ...budget, overrides: rest });
                toast.success("Plafond par défaut rétabli pour ce mois");
                onClose();
              }}
            >
              Rétablir le défaut
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button data-testid="limit-save-button" onClick={submit}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Budgets() {
  const data = useData();
  const currentMk = todayIso().slice(0, 7);
  const [mk, setMk] = useState(currentMk);
  const [newOpen, setNewOpen] = useState(false);
  const [limitTarget, setLimitTarget] = useState<{ budget: Budget; mode: "default" | "month"; mk: string } | null>(null);
  const [toDelete, setToDelete] = useState<Budget | null>(null);

  const statuses = useMemo(() => budgetStatuses(data, mk).sort((a, b) => b.ratio - a.ratio), [data, mk]);
  const totalLimit = round2(statuses.reduce((s, x) => s + x.limit, 0));
  const totalSpent = round2(statuses.reduce((s, x) => s + x.spent, 0));
  const alerts = statuses.filter((s) => s.level !== "ok");
  const year = mk.slice(0, 4);
  const yearSpent = useMemo(() => Array.from({ length: 12 }, (_, i) => spentByCategory(data, `${year}-${String(i + 1).padStart(2, "0")}`)), [data, year]);

  return (
    <div>
      <PageHeader
        eyebrow="Maîtriser ses dépenses"
        title="Budgets"
        subtitle="Un plafond mensuel par catégorie, ajustable mois par mois. Alerte orange à 80 %, rouge au dépassement. Les virements internes ne sont jamais comptés."
        actions={
          <Button data-testid="new-budget-button" className="h-10 rounded-xl" onClick={() => setNewOpen(true)}>
            <Plus /> Nouveau budget
          </Button>
        }
      />

      <div className="mb-5 flex items-center gap-2 animate-rise">
        <Button variant="outline" size="icon" aria-label="Mois précédent" data-testid="budget-prev-month" className="rounded-xl" onClick={() => setMk(shiftMonth(mk, -1))}>
          <ChevronLeft />
        </Button>
        <p data-testid="budget-month-label" className="min-w-44 text-center text-lg font-bold text-slate-900">
          {mkLabel(mk)}
        </p>
        <Button variant="outline" size="icon" aria-label="Mois suivant" data-testid="budget-next-month" className="rounded-xl" onClick={() => setMk(shiftMonth(mk, 1))}>
          <ChevronRight />
        </Button>
        {mk !== currentMk && (
          <Button variant="ghost" size="sm" data-testid="budget-current-month" onClick={() => setMk(currentMk)}>
            Mois en cours
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard testid="budget-total-card" tone="net" label="Budget du mois" value={money(totalLimit)} sub={`${statuses.length} catégorie${statuses.length > 1 ? "s" : ""} budgétée${statuses.length > 1 ? "s" : ""}`} />
        <StatCard testid="budget-spent-card" tone="expense" label="Dépensé" value={money(totalSpent)} sub={totalLimit ? `${Math.round((totalSpent / totalLimit) * 100)} % du budget` : "—"} />
        <StatCard testid="budget-remaining-card" tone={totalLimit - totalSpent < 0 ? "expense" : "income"} label="Reste" value={money(totalLimit - totalSpent, "EUR", true)} />
        <StatCard testid="budget-alerts-card" tone={alerts.some((a) => a.level === "over") ? "expense" : alerts.length ? "savings" : "plain"} label="Alertes" value={String(alerts.length)} sub={`${alerts.filter((a) => a.level === "over").length} dépassé(s) · ${alerts.filter((a) => a.level === "warn").length} à plus de 80 %`} />
      </div>

      <Panel className="mt-5" testid="budgets-panel">
        <PanelTitle sub="Triés du plus consommé au moins consommé">Budgets de {mkLabel(mk).toLowerCase()}</PanelTitle>
        {statuses.length === 0 ? (
          <EmptyState testid="budgets-empty" icon={<Target className="size-5" />} title="Aucun budget" text="Fixez un plafond mensuel pour vos principales catégories (courses, restaurants, shopping…)." action={<Button onClick={() => setNewOpen(true)}>Créer un budget</Button>} />
        ) : (
          <ul className="space-y-3">
            {statuses.map((s) => {
              const st = LEVEL_STYLES[s.level];
              const overridden = mk in s.budget.overrides;
              return (
                <li key={s.budget.id} data-testid="budget-row" data-level={s.level} className={cn("rounded-2xl border p-4 transition-colors", s.level === "over" ? "border-rose-200 bg-rose-50/40" : s.level === "warn" ? "border-amber-200 bg-amber-50/40" : "border-slate-100 bg-white")}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="size-3 rounded-full" style={{ background: catColor(data.categories, s.budget.category) }} />
                    <p data-testid="budget-category" className="font-semibold text-slate-900">
                      {s.budget.category}
                    </p>
                    <Chip testid="budget-level" className={st.chip}>
                      {s.level !== "ok" && <AlertTriangle className="size-3" />} {st.label}
                    </Chip>
                    {overridden && <Chip className="bg-blue-50 text-blue-700 ring-blue-200">Ajusté ce mois</Chip>}
                    <div className="ml-auto flex items-center gap-3">
                      <p className="text-sm tabular">
                        <b data-testid="budget-spent" className={st.text}>
                          {money(s.spent)}
                        </b>
                        <span className="text-slate-400"> / {money(s.limit)}</span>
                      </p>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" data-testid="budget-actions-button" aria-label="Actions" />}>
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem data-testid="budget-adjust-month" onClick={() => setLimitTarget({ budget: s.budget, mode: "month", mk })}>
                            <SlidersHorizontal /> Ajuster pour {MONTHS_LONG[Number(mk.slice(5)) - 1].toLowerCase()}
                          </DropdownMenuItem>
                          <DropdownMenuItem data-testid="budget-edit-default" onClick={() => setLimitTarget({ budget: s.budget, mode: "default", mk })}>
                            <Pencil /> Plafond par défaut
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" data-testid="budget-delete" onClick={() => setToDelete(s.budget)}>
                            <Trash2 /> Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div className="mt-3">
                    <ProgressBar value={s.ratio} color={st.bar} testid="budget-progress" />
                  </div>
                  <div className="mt-1.5 flex justify-between text-xs text-slate-500">
                    <span data-testid="budget-percent" className={cn("font-semibold", st.text)}>
                      {Math.round(s.ratio * 100)} %
                    </span>
                    <span>{s.remaining >= 0 ? `Reste ${money(s.remaining)}` : `Dépassement de ${money(-s.remaining)}`}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {data.budgets.length > 0 && (
        <Panel className="mt-5 overflow-hidden p-0 sm:p-0" testid="budget-year-grid">
          <div className="p-5 pb-0 sm:p-6 sm:pb-0">
            <PanelTitle sub="Cliquez sur une case pour ajuster le plafond de ce mois">
              <span className="flex items-center gap-2">
                <CalendarRange className="size-4 text-slate-500" /> Vue annuelle {year}
              </span>
            </PanelTitle>
          </div>
          <div className="overflow-x-auto pb-2">
            <table className="w-full min-w-[980px] text-xs">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/70 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-2.5 text-left">Catégorie</th>
                  {MONTHS.map((m) => (
                    <th key={m} className="px-1 py-2.5 text-center">
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.budgets.map((b) => (
                  <tr key={b.id} className="border-b border-slate-50">
                    <td className="whitespace-nowrap px-5 py-2 font-semibold text-slate-700">{b.category}</td>
                    {MONTHS.map((_, i) => {
                      const k = `${year}-${String(i + 1).padStart(2, "0")}`;
                      const limit = budgetLimit(b, k);
                      const spent = round2(Math.max(0, yearSpent[i].get(b.category) ?? 0));
                      const future = k > currentMk;
                      const lvl = levelOf(spent, limit);
                      return (
                        <td key={k} className="px-1 py-1.5">
                          <button
                            data-testid={`budget-cell-${b.category}-${i}`}
                            onClick={() => setLimitTarget({ budget: b, mode: "month", mk: k })}
                            className={cn(
                              "w-full rounded-lg px-1 py-1.5 text-center tabular transition-transform hover:scale-[1.04]",
                              future ? "bg-slate-50 text-slate-400" : lvl === "over" ? "bg-rose-100 text-rose-800" : lvl === "warn" ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-800",
                              k === mk && "ring-2 ring-slate-900",
                              k in b.overrides && "outline outline-1 outline-dashed outline-blue-400",
                            )}
                          >
                            <span className="block font-semibold">{future ? "—" : Math.round(spent)}</span>
                            <span className="block text-[10px] opacity-70">/ {Math.round(limit)}</span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <NewBudgetDialog open={newOpen} onClose={() => setNewOpen(false)} mk={mk} />
      <LimitDialog target={limitTarget} onClose={() => setLimitTarget(null)} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Supprimer ce budget ?"
        description={`Le budget « ${toDelete?.category} » et ses ajustements mensuels seront supprimés. Vos opérations ne sont pas modifiées.`}
        onConfirm={() => {
          if (toDelete) deleteBudget(toDelete.id);
          toast.success("Budget supprimé");
        }}
      />
    </div>
  );
}
