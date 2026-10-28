import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, MoreHorizontal, Pencil, PiggyBank, Plus, Split, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip, ConfirmDialog, EmptyState, Field, NativeSelect, PageHeader, Panel, PanelTitle, ProgressBar, StatCard, inputCls } from "@/components/kit";
import { allocate, deleteGoal, saveGoal, useData } from "@/lib/store";
import { accountBalance } from "@/lib/analytics";
import { fmtDate, fromIso, money, round2, todayIso, toIso, uid } from "@/lib/format";
import { parseAmount } from "@/lib/csv";
import type { Goal, GoalStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const COLORS = ["#10B981", "#3B82F6", "#F59E0B", "#EC4899", "#8B5CF6", "#06B6D4", "#F43F5E", "#64748B"];
const ICONS = ["🏖️", "🚗", "🏠", "🎓", "💻", "🎁", "🛟", "✈️", "💍", "🐶"];
const STATUS: Record<GoalStatus, { label: string; cls: string }> = {
  active: { label: "En cours", cls: "bg-blue-50 text-blue-800 ring-blue-200" },
  reached: { label: "Atteint", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  paused: { label: "En pause", cls: "bg-slate-100 text-slate-700 ring-slate-200" },
  abandoned: { label: "Abandonné", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
};

function monthsBetween(a: string, b: string) {
  const d1 = fromIso(a);
  const d2 = fromIso(b);
  return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()) + (d2.getDate() - d1.getDate()) / 30;
}

export function goalStats(g: Goal, today = todayIso()) {
  const remaining = round2(Math.max(0, g.target - g.allocated));
  const progress = g.target > 0 ? g.allocated / g.target : 0;
  const monthsLeft = g.targetDate ? monthsBetween(today, g.targetDate) : null;
  const perMonth = monthsLeft !== null ? (monthsLeft > 0 ? round2(remaining / Math.max(1, monthsLeft)) : remaining) : null;
  // Rythme actuel : allocations nettes des 90 derniers jours (ou depuis la création)
  const since = new Date(fromIso(today));
  since.setDate(since.getDate() - 90);
  const sinceIso = toIso(since) > g.createdAt.slice(0, 10) ? toIso(since) : g.createdAt.slice(0, 10);
  const recent = g.history.filter((h) => h.date >= sinceIso).reduce((s, h) => s + h.amount, 0);
  const spanMonths = Math.max(1, monthsBetween(sinceIso, today));
  const pace = recent > 0 ? recent / spanMonths : 0;
  let eta: string | null = null;
  if (remaining === 0) eta = today;
  else if (pace > 0) {
    const d = fromIso(today);
    d.setDate(d.getDate() + Math.ceil((remaining / pace) * 30.4));
    eta = toIso(d);
  }
  return { remaining, progress, perMonth, pace: round2(pace), eta, monthsLeft };
}

function GoalDialog({ open, goal, onClose }: { open: boolean; goal: Goal | null; onClose: () => void }) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [initial, setInitial] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState(ICONS[0]);
  const [status, setStatus] = useState<GoalStatus>("active");
  useEffect(() => {
    if (!open) return;
    setName(goal?.name ?? "");
    setTarget(goal ? String(goal.target).replace(".", ",") : "");
    setInitial("");
    setTargetDate(goal?.targetDate ?? "");
    setColor(goal?.color ?? COLORS[Math.floor(Math.random() * COLORS.length)]);
    setIcon(goal?.icon ?? ICONS[0]);
    setStatus(goal?.status ?? "active");
  }, [open, goal]);

  const submit = () => {
    const t = parseAmount(target);
    if (!name.trim()) return toast.error("Donnez un nom à l'objectif");
    if (!t || t <= 0) return toast.error("Indiquez un montant cible positif");
    const init = parseAmount(initial) ?? 0;
    const g: Goal = goal
      ? { ...goal, name: name.trim(), target: t, targetDate: targetDate || undefined, color, icon, status }
      : { id: uid(), name: name.trim(), target: t, allocated: round2(Math.max(0, init)), targetDate: targetDate || undefined, color, icon, status, history: init > 0 ? [{ date: todayIso(), amount: init }] : [], createdAt: new Date().toISOString() };
    saveGoal(g);
    toast.success(goal ? "Objectif modifié" : "Objectif créé");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="goal-dialog" className="rounded-3xl p-6 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{goal ? "Modifier l'objectif" : "Nouvel objectif d'épargne"}</DialogTitle>
          <DialogDescription>Un objectif est une répartition virtuelle de votre compte d'épargne : il ne crée aucun solde bancaire.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nom" className="col-span-2">
            <Input data-testid="goal-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Vacances d'été" className={inputCls} />
          </Field>
          <Field label="Montant cible (€)">
            <Input data-testid="goal-target-input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="1 500" className={inputCls} />
          </Field>
          {goal ? (
            <Field label="Statut">
              <NativeSelect testid="goal-status-select" value={status} onChange={(v) => setStatus(v as GoalStatus)} options={(Object.keys(STATUS) as GoalStatus[]).map((k) => ({ value: k, label: STATUS[k].label }))} />
            </Field>
          ) : (
            <Field label="Déjà alloué (€)">
              <Input data-testid="goal-initial-input" inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} placeholder="0" className={inputCls} />
            </Field>
          )}
          <Field label="Date cible (facultative)" className="col-span-2">
            <Input data-testid="goal-date-input" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className={inputCls} />
          </Field>
          <div className="col-span-2">
            <p className="mb-1.5 text-xs font-semibold text-slate-600">Icône et couleur</p>
            <div className="flex flex-wrap gap-1.5">
              {ICONS.map((i) => (
                <button key={i} data-testid={`goal-icon-${i}`} onClick={() => setIcon(i)} className={cn("grid size-9 place-items-center rounded-xl text-lg transition-transform hover:scale-105", icon === i ? "bg-slate-900/10 ring-2 ring-slate-900" : "bg-slate-50")}>
                  {i}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-1.5">
              {COLORS.map((c) => (
                <button key={c} aria-label={`Couleur ${c}`} data-testid={`goal-color-${c.slice(1)}`} onClick={() => setColor(c)} className={cn("size-7 rounded-full transition-transform hover:scale-110", color === c && "ring-2 ring-offset-2 ring-slate-900")} style={{ background: c }} />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="-mx-6 -mb-6 rounded-b-3xl px-6">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button data-testid="goal-save-button" onClick={submit}>
            {goal ? "Enregistrer" : "Créer l'objectif"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AllocateDialog({ goal, mode, onClose, unallocated }: { goal: Goal | null; mode: "add" | "remove"; onClose: () => void; unallocated: number }) {
  const [amount, setAmount] = useState("");
  useEffect(() => setAmount(""), [goal]);
  const submit = () => {
    const a = parseAmount(amount);
    if (!goal || !a || a <= 0) return toast.error("Montant invalide");
    if (mode === "remove" && a > goal.allocated) return toast.error("Vous ne pouvez pas désallouer plus que le montant alloué");
    allocate({ [goal.id]: mode === "add" ? a : -a });
    toast.success(mode === "add" ? `${money(a)} alloués à « ${goal.name} »` : `${money(a)} désalloués de « ${goal.name} »`);
    onClose();
  };
  const a = parseAmount(amount) ?? 0;
  return (
    <Dialog open={!!goal} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="allocate-dialog" className="rounded-3xl p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {mode === "add" ? "Allouer à" : "Désallouer de"} « {goal?.name} »
          </DialogTitle>
          <DialogDescription>
            {mode === "add" ? `Solde non alloué disponible : ${money(unallocated)}` : `Montant actuellement alloué : ${money(goal?.allocated ?? 0)}`}
          </DialogDescription>
        </DialogHeader>
        <Field label="Montant (€)">
          <Input data-testid="allocate-amount-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} autoFocus />
        </Field>
        {mode === "add" && a > unallocated && (
          <p data-testid="allocate-over-warning" className="flex items-center gap-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800">
            <AlertTriangle className="size-4" /> Ce montant dépasse le solde non alloué : vos objectifs dépasseront le solde réel.
          </p>
        )}
        <DialogFooter className="-mx-6 -mb-6 rounded-b-3xl px-6">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button data-testid="allocate-confirm-button" onClick={submit}>
            {mode === "add" ? "Allouer" : "Désallouer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SplitDialog({ open, onClose, goals, unallocated }: { open: boolean; onClose: () => void; goals: Goal[]; unallocated: number }) {
  const [total, setTotal] = useState("");
  const [parts, setParts] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setTotal(unallocated > 0 ? String(round2(unallocated)).replace(".", ",") : "");
      setParts({});
    }
  }, [open, unallocated]);
  const t = parseAmount(total) ?? 0;
  const sum = round2(Object.values(parts).reduce((s, v) => s + (parseAmount(v) ?? 0), 0));
  const distribute = (how: "equal" | "remaining") => {
    const base = how === "equal" ? goals.map(() => 1) : goals.map((g) => Math.max(0, g.target - g.allocated));
    const tot = base.reduce((s, v) => s + v, 0) || 1;
    const next: Record<string, string> = {};
    goals.forEach((g, i) => (next[g.id] = String(round2((t * base[i]) / tot)).replace(".", ",")));
    setParts(next);
  };
  const submit = () => {
    const amounts: Record<string, number> = {};
    for (const g of goals) {
      const v = parseAmount(parts[g.id] ?? "") ?? 0;
      if (v > 0) amounts[g.id] = v;
    }
    if (!Object.keys(amounts).length) return toast.error("Indiquez au moins un montant");
    allocate(amounts);
    toast.success(`${money(sum)} répartis entre ${Object.keys(amounts).length} objectifs`);
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="split-dialog" className="rounded-3xl p-6 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Répartir un versement</DialogTitle>
          <DialogDescription>Répartissez un montant entre plusieurs objectifs en une fois.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Montant à répartir (€)" className="flex-1">
            <Input data-testid="split-total-input" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} className={inputCls} />
          </Field>
          <Button variant="outline" className="h-10 rounded-xl" data-testid="split-equal-button" onClick={() => distribute("equal")}>
            À parts égales
          </Button>
          <Button variant="outline" className="h-10 rounded-xl" data-testid="split-remaining-button" onClick={() => distribute("remaining")}>
            Au prorata du restant
          </Button>
        </div>
        <div className="space-y-2">
          {goals.map((g) => (
            <div key={g.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-2.5">
              <span className="text-lg">{g.icon}</span>
              <span className="flex-1 truncate text-sm font-medium">{g.name}</span>
              <Input data-testid={`split-part-${g.id}`} inputMode="decimal" value={parts[g.id] ?? ""} onChange={(e) => setParts((p) => ({ ...p, [g.id]: e.target.value }))} placeholder="0" className="h-9 w-28 rounded-xl bg-white text-right" />
            </div>
          ))}
        </div>
        <p className={cn("text-xs", Math.abs(sum - t) > 0.01 ? "text-amber-700" : "text-slate-500")} data-testid="split-sum">
          Total réparti : {money(sum)} / {money(t)}
        </p>
        <DialogFooter className="-mx-6 -mb-6 rounded-b-3xl px-6">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button data-testid="split-confirm-button" onClick={submit}>
            Répartir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Savings() {
  const data = useData();
  const today = todayIso();
  const savingsAccounts = data.accounts.filter((a) => a.type === "savings");
  const real = round2(savingsAccounts.reduce((s, a) => s + accountBalance(a, data.transactions, today), 0));
  const counted = data.goals.filter((g) => g.status !== "abandoned");
  const allocated = round2(counted.reduce((s, g) => s + g.allocated, 0));
  const unallocated = round2(real - allocated);
  const interestYear = useMemo(
    () => round2(data.transactions.filter((t) => savingsAccounts.some((a) => a.id === t.accountId) && t.category === "Intérêts" && t.date.startsWith(today.slice(0, 4))).reduce((s, t) => s + t.amount, 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.transactions, today],
  );

  const [goalDialog, setGoalDialog] = useState<{ open: boolean; goal: Goal | null }>({ open: false, goal: null });
  const [alloc, setAlloc] = useState<{ goal: Goal | null; mode: "add" | "remove" }>({ goal: null, mode: "add" });
  const [splitOpen, setSplitOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Goal | null>(null);
  const activeGoals = data.goals.filter((g) => g.status === "active" || g.status === "paused");

  return (
    <div>
      <PageHeader
        eyebrow="Compte d'épargne"
        title="Épargne et objectifs"
        subtitle="Fragmentez virtuellement votre compte d'épargne en objectifs. Les intérêts restent dans le solde réel ; les objectifs ne créent aucun faux solde."
        actions={
          <>
            <Button variant="outline" data-testid="split-open-button" disabled={!activeGoals.length} onClick={() => setSplitOpen(true)} className="h-10 rounded-xl">
              <Split /> Répartir un versement
            </Button>
            <Button data-testid="new-goal-button" onClick={() => setGoalDialog({ open: true, goal: null })} className="h-10 rounded-xl">
              <Plus /> Nouvel objectif
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard testid="savings-real-card" tone="savings" label="Solde réel du compte d'épargne" value={money(real)} icon={<PiggyBank className="size-4 text-amber-700" />} sub={`Intérêts nets ${today.slice(0, 4)} : ${money(interestYear)}`} />
        <StatCard testid="savings-allocated-card" tone="net" label="Total alloué aux objectifs" value={money(allocated)} sub={`${counted.length} objectif${counted.length > 1 ? "s" : ""} (hors abandonnés)`} />
        <StatCard testid="savings-unallocated-card" tone={unallocated < 0 ? "expense" : "income"} label="Solde non alloué" value={money(unallocated, "EUR")} sub={unallocated < 0 ? "Vos objectifs dépassent le solde réel" : "Disponible pour vos objectifs"} />
      </div>

      {unallocated < 0 && (
        <div data-testid="over-allocation-alert" className="mt-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 animate-rise">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Sur-allocation de {money(-unallocated)}</p>
            <p className="text-rose-800/80">La somme des objectifs dépasse le solde réel du compte d'épargne. Désallouez un montant ou alimentez votre épargne.</p>
          </div>
        </div>
      )}

      <Panel className="mt-5" testid="goals-panel">
        <PanelTitle sub="Progression, reste à épargner et estimations">Objectifs d'épargne</PanelTitle>
        {data.goals.length === 0 ? (
          <EmptyState
            testid="goals-empty-state"
            icon={<PiggyBank className="size-5" />}
            title="Aucun objectif pour l'instant"
            text="Créez un objectif (vacances, voiture, fonds d'urgence…) puis allouez-lui une partie de votre épargne."
            action={<Button onClick={() => setGoalDialog({ open: true, goal: null })}>Créer un objectif</Button>}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.goals.map((g) => {
              const s = goalStats(g, today);
              return (
                <div key={g.id} data-testid="goal-card" className={cn("rounded-3xl border border-slate-100 p-5 transition-shadow hover:shadow-md", g.status === "abandoned" && "opacity-60")} style={{ background: `linear-gradient(160deg, ${g.color}12, #ffffff 55%)` }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="grid size-11 place-items-center rounded-2xl text-xl" style={{ background: g.color + "22" }}>
                        {g.icon}
                      </span>
                      <div>
                        <p data-testid="goal-name" className="font-bold text-slate-900">
                          {g.name}
                        </p>
                        <Chip className={STATUS[g.status].cls}>{STATUS[g.status].label}</Chip>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" data-testid="goal-actions-button" aria-label="Actions" />}>
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem data-testid="goal-edit" onClick={() => setGoalDialog({ open: true, goal: g })}>
                          <Pencil /> Modifier
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" data-testid="goal-delete" onClick={() => setToDelete(g)}>
                          <Trash2 /> Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="mt-4 flex items-baseline justify-between">
                    <p className="text-2xl font-extrabold tabular text-slate-900" data-testid="goal-allocated">
                      {money(g.allocated)}
                    </p>
                    <p className="text-sm text-slate-500 tabular">/ {money(g.target)}</p>
                  </div>
                  <div className="mt-2">
                    <ProgressBar value={s.progress} color={g.color} testid="goal-progress" />
                  </div>
                  <div className="mt-1.5 flex justify-between text-xs text-slate-500">
                    <span data-testid="goal-percent" className="font-semibold text-slate-700">
                      {Math.round(s.progress * 100)} %
                    </span>
                    <span>Reste {money(s.remaining)}</span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-white/70 p-2.5">
                      <dt className="text-slate-500">À épargner / mois</dt>
                      <dd className="mt-0.5 font-semibold text-slate-800" data-testid="goal-per-month">
                        {s.perMonth !== null ? money(s.perMonth) : "Pas de date cible"}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-white/70 p-2.5">
                      <dt className="text-slate-500">Atteinte estimée</dt>
                      <dd className="mt-0.5 font-semibold text-slate-800" data-testid="goal-eta">
                        {s.remaining === 0 ? "Atteint 🎉" : s.eta ? fmtDate(s.eta) : "Rythme insuffisant"}
                      </dd>
                    </div>
                  </dl>
                  {g.targetDate && <p className="mt-2 text-[11px] text-slate-400">Date cible : {fmtDate(g.targetDate)}{s.pace ? ` · rythme actuel ${money(s.pace)}/mois` : ""}</p>}
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" data-testid="goal-allocate-button" className="flex-1 rounded-xl" onClick={() => setAlloc({ goal: g, mode: "add" })}>
                      <ArrowDownToLine /> Allouer
                    </Button>
                    <Button size="sm" variant="outline" data-testid="goal-deallocate-button" className="flex-1 rounded-xl" disabled={g.allocated <= 0} onClick={() => setAlloc({ goal: g, mode: "remove" })}>
                      <ArrowUpFromLine /> Désallouer
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <GoalDialog open={goalDialog.open} goal={goalDialog.goal} onClose={() => setGoalDialog({ open: false, goal: null })} />
      <AllocateDialog goal={alloc.goal} mode={alloc.mode} unallocated={unallocated} onClose={() => setAlloc({ goal: null, mode: "add" })} />
      <SplitDialog open={splitOpen} onClose={() => setSplitOpen(false)} goals={activeGoals} unallocated={unallocated} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Supprimer cet objectif ?"
        description={`« ${toDelete?.name} » sera supprimé et son montant alloué (${money(toDelete?.allocated ?? 0)}) redeviendra non alloué.`}
        onConfirm={() => {
          if (toDelete) deleteGoal(toDelete.id);
          toast.success("Objectif supprimé");
        }}
      />
    </div>
  );
}
