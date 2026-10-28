import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, CalendarRange, Landmark, Forward, ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Plus, SlidersHorizontal, Target, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip, ConfirmDialog, EmptyState, Field, NativeSelect, PageHeader, Panel, PanelTitle, ProgressBar, StatCard, inputCls } from "@/components/kit";
import { deleteBudget, saveBudget, useData } from "@/lib/store";
import { averageSpent, budgetLabel, budgetLimit, budgetSpent, budgetStatuses, effectiveLimit, LEVEL_STYLES, levelOf, scopeKey, shiftMonth } from "@/lib/budgets";
import { Checkbox } from "@/components/ui/checkbox";
import { catColor } from "@/lib/analytics";
import { money, MONTHS, MONTHS_LONG, round2, todayIso, uid } from "@/lib/format";
import { parseAmount } from "@/lib/csv";
import { INTERNAL_CATEGORY } from "@/lib/rules";
import type { Budget } from "@/lib/types";
import { cn } from "@/lib/utils";

const mkLabel = (mk: string) => `${MONTHS_LONG[Number(mk.slice(5, 7)) - 1]} ${mk.slice(0, 4)}`;

function NewBudgetDialog({ open, onClose, mk, presetAccount }: { open: boolean; onClose: () => void; mk: string; presetAccount?: string }) {
  const data = useData();
  const accounts = data.accounts.filter((a) => a.currency === "EUR" && !a.archived);
  const [scope, setScope] = useState<"category" | "account">("category");
  const [accountId, setAccountId] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [rollover, setRollover] = useState(true);
  const taken = new Set(data.budgets.map(scopeKey));
  const cats = data.categories.filter((c) => c.name !== INTERNAL_CATEGORY);
  const available = cats.filter((c) => !taken.has(`|${c.name}`));
  useEffect(() => {
    if (open) {
      setScope(presetAccount ? "account" : "category");
      setAccountId(presetAccount ?? accounts[0]?.id ?? "");
      setCategory(presetAccount ? "" : (available[0]?.name ?? ""));
      setAmount("");
      setRollover(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetAccount]);
  const switchScope = (v: "category" | "account") => {
    setScope(v);
    setCategory(v === "account" ? "" : (available[0]?.name ?? ""));
  };
  const target = { category, accountId: scope === "account" ? accountId : undefined };
  const duplicate = taken.has(scopeKey(target));
  const valid = scope === "account" ? !!accountId : !!category;
  const avg = valid ? averageSpent(data, target, mk) : 0;
  const submit = () => {
    const a = parseAmount(amount);
    if (scope === "category" && !category) return toast.error("Choisissez une catégorie");
    if (scope === "account" && !accountId) return toast.error("Choisissez un compte");
    if (duplicate) return toast.error("Un budget existe déjà pour ce périmètre");
    if (a === null || a <= 0) return toast.error("Indiquez un plafond positif");
    saveBudget({ id: uid(), category, accountId: target.accountId, amount: round2(a), overrides: {}, rollover, startMonth: mk });
    toast.success(`Budget « ${budgetLabel(data, target)} » créé`);
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="budget-dialog" className="rounded-3xl p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Nouveau budget mensuel</DialogTitle>
          <DialogDescription>Plafond appliqué chaque mois ; vous pourrez l'ajuster mois par mois.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-slate-100/80 p-1" role="radiogroup">
          {(
            [
              ["category", "Par catégorie", "Tous comptes confondus"],
              ["account", "Par compte", "Un compte ou une Pocket"],
            ] as const
          ).map(([v, l, h]) => (
            <button key={v} type="button" role="radio" aria-checked={scope === v} data-testid={`budget-scope-${v}`} onClick={() => switchScope(v)} className={cn("rounded-xl px-3 py-2 text-left transition-[background-color,box-shadow] duration-200", scope === v ? "bg-white shadow-sm ring-1 ring-slate-200" : "hover:bg-white/60")}>
              <span className="block text-xs font-bold text-slate-900">{l}</span>
              <span className="block text-[11px] text-slate-500">{h}</span>
            </button>
          ))}
        </div>
        {scope === "account" && (
          <Field label="Compte">
            <NativeSelect testid="budget-account-select" value={accountId} onChange={setAccountId} options={accounts.map((a) => ({ value: a.id, label: a.name }))} className="w-full" />
          </Field>
        )}
        <Field label={scope === "account" ? "Catégorie (facultative)" : "Catégorie"}>
          <NativeSelect
            testid="budget-category-select"
            value={category}
            onChange={setCategory}
            options={scope === "account" ? [{ value: "", label: "Toutes les catégories" }, ...cats.map((c) => ({ value: c.name, label: c.name }))] : available.map((c) => ({ value: c.name, label: c.name }))}
            className="w-full"
          />
        </Field>
        {duplicate && valid && <p data-testid="budget-duplicate-warning" className="-mt-1 text-xs text-amber-700">Un budget existe déjà pour ce périmètre.</p>}
        <Field label="Plafond mensuel (€)" hint={avg ? `Moyenne des 3 derniers mois : ${money(avg)}` : "Pas de dépense sur les 3 derniers mois"}>
          <Input data-testid="budget-amount-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={avg ? String(Math.ceil(avg)) : "200"} className={inputCls} />
        </Field>
        {avg > 0 && (
          <button data-testid="budget-use-average" className="self-start text-xs font-semibold text-blue-700 hover:underline" onClick={() => setAmount(String(Math.ceil(avg)))}>
            Utiliser la moyenne ({money(Math.ceil(avg))})
          </button>
        )}
        <label className="flex items-start gap-2.5 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
          <Checkbox data-testid="budget-rollover-checkbox" checked={rollover} onCheckedChange={(c) => setRollover(!!c)} className="mt-0.5" />
          <span>
            <b className="font-semibold">Reporter le reste non dépensé</b>
            <span className="block text-xs text-slate-500">Le reste positif s'ajoute au plafond du mois suivant (un dépassement n'est pas reporté).</span>
          </span>
        </label>
        <DialogFooter className="-mx-6 -mb-6 rounded-b-3xl px-6">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button data-testid="budget-save-button" disabled={duplicate} onClick={submit}>
            Créer le budget
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LimitDialog({ target, onClose }: { target: { budget: Budget; mode: "default" | "month"; mk: string } | null; onClose: () => void }) {
  const data = useData();
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
          <DialogTitle className="text-xl font-bold">{mode === "default" ? `Plafond par défaut · ${budgetLabel(data, budget)}` : `${budgetLabel(data, budget)} · ${mkLabel(mk)}`}</DialogTitle>
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
  const [params, setParams] = useSearchParams();
  const presetAccount = params.get("compte") ?? undefined;
  const [newOpen, setNewOpen] = useState(!!presetAccount);
  const [filter, setFilter] = useState<"all" | "category" | "account">("all");
  const [limitTarget, setLimitTarget] = useState<{ budget: Budget; mode: "default" | "month"; mk: string } | null>(null);
  const [toDelete, setToDelete] = useState<Budget | null>(null);

  const allStatuses = useMemo(() => budgetStatuses(data, mk).sort((a, b) => b.ratio - a.ratio), [data, mk]);
  const statuses = allStatuses.filter((s) => filter === "all" || (filter === "account" ? !!s.budget.accountId : !s.budget.accountId));
  const gridBudgets = data.budgets.filter((b) => filter === "all" || (filter === "account" ? !!b.accountId : !b.accountId));
  const closeNew = () => {
    setNewOpen(false);
    if (presetAccount) setParams({}, { replace: true });
  };
  const totalLimit = round2(statuses.reduce((s, x) => s + x.limit, 0));
  const totalSpent = round2(statuses.reduce((s, x) => s + x.spent, 0));
  const alerts = statuses.filter((s) => s.level !== "ok");
  const year = mk.slice(0, 4);

  return (
    <div>
      <PageHeader
        eyebrow="Maîtriser ses dépenses"
        title="Budgets"
        subtitle="Un plafond mensuel par catégorie ou par compte, ajustable mois par mois, avec report automatique du reste non dépensé. Alerte orange à 80 %, rouge au dépassement. Les virements internes ne sont jamais comptés."
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
        <StatCard testid="budget-total-card" tone="net" label="Budget du mois" value={money(totalLimit)} sub={`${statuses.length} budget${statuses.length > 1 ? "s" : ""}${filter === "all" ? "" : filter === "account" ? " de compte" : " de catégorie"}`} />
        <StatCard testid="budget-spent-card" tone="expense" label="Dépensé" value={money(totalSpent)} sub={totalLimit ? `${Math.round((totalSpent / totalLimit) * 100)} % du budget` : "—"} />
        <StatCard testid="budget-remaining-card" tone={totalLimit - totalSpent < 0 ? "expense" : "income"} label="Reste" value={money(totalLimit - totalSpent, "EUR", true)} />
        <StatCard testid="budget-alerts-card" tone={alerts.some((a) => a.level === "over") ? "expense" : alerts.length ? "savings" : "plain"} label="Alertes" value={String(alerts.length)} sub={`${alerts.filter((a) => a.level === "over").length} dépassé(s) · ${alerts.filter((a) => a.level === "warn").length} à plus de 80 %`} />
      </div>

      <Panel className="mt-5" testid="budgets-panel">
        <PanelTitle
          sub="Triés du plus consommé au moins consommé"
          aside={
            <div className="flex gap-1 rounded-2xl bg-slate-100/80 p-1">
              {(
                [
                  ["all", "Tous"],
                  ["category", "Catégories"],
                  ["account", "Comptes"],
                ] as const
              ).map(([v, l]) => (
                <button key={v} data-testid={`budget-filter-${v}`} onClick={() => setFilter(v)} className={cn("rounded-xl px-3 py-1.5 text-xs font-semibold transition-[background-color,color] duration-200", filter === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900")}>
                  {l}
                </button>
              ))}
            </div>
          }
        >
          Budgets de {mkLabel(mk).toLowerCase()}
        </PanelTitle>
        {statuses.length === 0 ? (
          <EmptyState testid="budgets-empty" icon={<Target className="size-5" />} title="Aucun budget" text="Fixez un plafond mensuel pour vos principales catégories (courses, restaurants…) ou pour un compte / une Pocket." action={<Button onClick={() => setNewOpen(true)}>Créer un budget</Button>} />
        ) : (
          <ul className="space-y-3">
            {statuses.map((s) => {
              const st = LEVEL_STYLES[s.level];
              const overridden = mk in s.budget.overrides;
              return (
                <li key={s.budget.id} data-testid="budget-row" data-level={s.level} className={cn("rounded-2xl border p-4 transition-colors", s.level === "over" ? "border-rose-200 bg-rose-50/40" : s.level === "warn" ? "border-amber-200 bg-amber-50/40" : "border-slate-100 bg-white")}>
                  <div className="flex flex-wrap items-center gap-3">
                    {s.budget.category ? <span className="size-3 rounded-full" style={{ background: catColor(data.categories, s.budget.category) }} /> : <Landmark className="size-4 text-slate-500" />}
                    <p data-testid="budget-category" className="font-semibold text-slate-900">
                      {s.budget.category || data.accounts.find((a) => a.id === s.budget.accountId)?.name}
                    </p>
                    {s.budget.accountId && (
                      <Chip testid="budget-account-chip" className="bg-slate-100 text-slate-700 ring-slate-200">
                        <Landmark className="size-3" /> {s.budget.category ? data.accounts.find((a) => a.id === s.budget.accountId)?.name : "Toutes catégories"}
                      </Chip>
                    )}
                    <Chip testid="budget-level" className={st.chip}>
                      {s.level !== "ok" && <AlertTriangle className="size-3" />} {st.label}
                    </Chip>
                    {overridden && <Chip className="bg-blue-50 text-blue-700 ring-blue-200">Ajusté ce mois</Chip>}
                    {s.carry > 0 && (
                      <Chip testid="budget-carry" className="bg-violet-50 text-violet-700 ring-violet-200">
                        <Forward className="size-3" /> +{money(s.carry)} reportés
                      </Chip>
                    )}
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
                          <DropdownMenuItem
                            data-testid="budget-toggle-rollover"
                            onClick={() => {
                              const on = s.budget.rollover === false;
                              saveBudget({ ...s.budget, rollover: on, startMonth: s.budget.startMonth ?? mk });
                              toast.success(on ? "Report du reste activé" : "Report du reste désactivé");
                            }}
                          >
                            <Forward /> {s.budget.rollover === false ? "Activer le report du reste" : "Désactiver le report du reste"}
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
                    <span>
                      {s.carry > 0 && <span className="mr-2 text-slate-400">Plafond {money(s.base)} + report {money(s.carry)}</span>}
                      {s.remaining >= 0 ? `Reste ${money(s.remaining)}` : `Dépassement de ${money(-s.remaining)}`}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {gridBudgets.length > 0 && (
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
                  <th className="px-5 py-2.5 text-left">Budget</th>
                  {MONTHS.map((m) => (
                    <th key={m} className="px-1 py-2.5 text-center">
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gridBudgets.map((b) => (
                  <tr key={b.id} className="border-b border-slate-50">
                    <td className="whitespace-nowrap px-5 py-2 font-semibold text-slate-700">{budgetLabel(data, b)}</td>
                    {MONTHS.map((_, i) => {
                      const k = `${year}-${String(i + 1).padStart(2, "0")}`;
                      const limit = effectiveLimit(data, b, k);
                      const spent = budgetSpent(data, b, k);
                      const future = k > currentMk;
                      const lvl = levelOf(spent, limit);
                      return (
                        <td key={k} className="px-1 py-1.5">
                          <button
                            data-testid={`budget-cell-${b.id}-${i}`}
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

      <NewBudgetDialog open={newOpen} onClose={closeNew} mk={mk} presetAccount={presetAccount} />
      <LimitDialog target={limitTarget} onClose={() => setLimitTarget(null)} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Supprimer ce budget ?"
        description={`Le budget « ${toDelete ? budgetLabel(data, toDelete) : ""} » et ses ajustements mensuels seront supprimés. Vos opérations ne sont pas modifiées.`}
        onConfirm={() => {
          if (toDelete) deleteBudget(toDelete.id);
          toast.success("Budget supprimé");
        }}
      />
    </div>
  );
}
