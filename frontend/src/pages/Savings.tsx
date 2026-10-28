import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { toastUndo } from "@/lib/undo";
import { AlertTriangle, Archive, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, ChevronDown, Lock, MoreHorizontal, Pencil, PiggyBank, Plus, RefreshCcw, Scale, Sparkles, Split, Trash2, Undo2, Wand2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip, ConfirmDialog, EmptyState, Field, NativeSelect, PageHeader, Panel, PanelTitle, ProgressBar, StatCard, inputCls } from "@/components/kit";
import { allocate, deleteGoal, saveGoal, saveGoals, useData } from "@/lib/store";
import { accountBalance } from "@/lib/analytics";
import { fmtDate, money, round2, todayIso, uid } from "@/lib/format";
import { parseAmount } from "@/lib/csv";
import { monthsBetween, goalStats, goalStatusLine, hasTarget, interestEstimate, KIND_LABELS, kindOf, PRIORITY, priorityOf, splitByNeed, splitByWeights, suggestAllocation, syncGoalStatus, type GoalStats } from "@/lib/goals";
import type { Goal, GoalKind, GoalPriority, GoalStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const COLORS = ["#10B981", "#3B82F6", "#F59E0B", "#EC4899", "#8B5CF6", "#06B6D4", "#F43F5E", "#64748B"];
const ICONS = ["🏖️", "🚗", "🏠", "🎓", "💻", "🎁", "🛟", "✈️", "💍", "🐶"];
const STATUS: Record<GoalStatus, { label: string; cls: string }> = {
  active: { label: "En cours", cls: "bg-blue-50 text-blue-800 ring-blue-200" },
  reached: { label: "🎯 Atteint", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  paused: { label: "En pause", cls: "bg-slate-100 text-slate-700 ring-slate-200" },
  abandoned: { label: "Abandonné", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
  archived: { label: "Archivé", cls: "bg-slate-100 text-slate-500 ring-slate-200" },
};
const KINDS: GoalKind[] = ["target", "open", "monthly", "debt"];
const PRIORITIES: GoalPriority[] = ["essential", "important", "bonus"];
const fr = (v: number) => String(round2(v)).replace(".", ",");
const EPS = 0.005;

/* ---------------- Formulaire objectif ---------------- */
type DialogMode = { kind: "create" } | { kind: "edit"; goal: Goal } | { kind: "renew"; goal: Goal } | { kind: "from"; source: Goal };

function GoalDialog({ mode, onClose, unallocated }: { mode: DialogMode | null; onClose: () => void; unallocated: number }) {
  const goal = mode && (mode.kind === "edit" || mode.kind === "renew") ? mode.goal : null;
  const source = mode?.kind === "from" ? mode.source : null;
  const [name, setName] = useState("");
  const [kind, setKind] = useState<GoalKind>("target");
  const [target, setTarget] = useState("");
  const [monthly, setMonthly] = useState("");
  const [minimum, setMinimum] = useState("");
  const [initial, setInitial] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState(ICONS[0]);
  const [priority, setPriority] = useState<GoalPriority>("important");
  const [status, setStatus] = useState<GoalStatus>("active");
  const [custom, setCustom] = useState(false);
  const [accountId, setAccountId] = useState("");
  const accounts = useData().accounts.filter((a) => !a.archived && a.currency === "EUR");
  useEffect(() => {
    if (!mode) return;
    const renew = mode.kind === "renew";
    setName(goal?.name ?? "");
    setKind(goal ? kindOf(goal) : "target");
    setTarget(goal && hasTarget(goal) && !renew ? fr(goal.target) : "");
    setMonthly(goal?.monthly ? fr(goal.monthly) : "");
    setMinimum(goal?.minimum ? fr(goal.minimum) : "");
    setInitial(source ? fr(source.allocated) : "");
    setTargetDate(renew ? "" : (goal?.targetDate ?? ""));
    const c = goal?.color ?? COLORS[Math.floor(Math.random() * COLORS.length)];
    const i = goal?.icon ?? ICONS[0];
    setColor(c);
    setIcon(i);
    setCustom(!COLORS.includes(c) || !ICONS.includes(i));
    setPriority(goal ? priorityOf(goal) : "important");
    setStatus(goal?.status ?? "active");
    setAccountId(goal?.accountId ?? "");
  }, [mode, goal, source]);

  const available = source ? source.allocated : unallocated;
  const submit = () => {
    const t = parseAmount(target);
    const m = parseAmount(monthly);
    const init = parseAmount(initial) ?? 0;
    const mn = parseAmount(minimum);
    if (!name.trim()) return toast.error("Donnez un nom à l'objectif");
    if (kind === "target" && (!t || t <= 0)) return toast.error("Un objectif cible demande un montant cible supérieur à 0 €");
    if (kind === "debt" && (!t || t <= 0)) return toast.error("Indiquez le montant total à rembourser");
    if (kind === "debt" && (!m || m <= 0)) return toast.error("Indiquez la mensualité de remboursement");
    if (kind === "monthly" && (!m || m <= 0)) return toast.error("Un objectif mensuel demande un versement mensuel supérieur à 0 €");
    if (m !== null && m < 0) return toast.error("Le versement mensuel ne peut pas être négatif");
    if (mn !== null && mn < 0) return toast.error("Le minimum souhaité ne peut pas être négatif");
    if (init < 0) return toast.error("Le montant alloué ne peut pas être négatif");
    if (!goal && init > Math.max(0, available) + EPS) return toast.error(`Vous ne pouvez allouer que ${money(Math.max(0, available))} au maximum`);
    if (!icon.trim()) return toast.error("Choisissez une icône");
    const base = { name: name.trim(), kind, target: kind === "target" || kind === "debt" ? round2(t ?? 0) : 0, accountId: accountId || undefined, monthly: m && m > 0 ? round2(m) : undefined, minimum: (kind === "open" || kind === "monthly") && mn && mn > 0 ? round2(mn) : undefined, targetDate: kind === "open" || kind === "debt" ? undefined : targetDate || undefined, color, icon: icon.trim(), priority };
    const today = todayIso();
    if (goal) {
      const next = syncGoalStatus({ ...goal, ...base, status: mode?.kind === "renew" ? "active" : status, reachedAck: mode?.kind === "renew" ? false : goal.reachedAck });
      saveGoal(next);
      toast.success(mode?.kind === "renew" ? "Objectif renouvelé" : "Objectif modifié");
    } else {
      const amount = round2(init);
      const created = syncGoalStatus({ id: uid(), ...base, allocated: amount, status: "active", history: amount > 0 ? [{ date: today, amount }] : [], createdAt: new Date().toISOString() });
      if (source) {
        const left = round2(source.allocated - amount);
        saveGoals([{ ...source, allocated: left, status: "archived", history: amount > 0 ? [...source.history, { date: today, amount: -amount }] : source.history }, created]);
        toast.success(`${money(amount)} transférés de « ${source.name} » vers « ${created.name} »`);
      } else {
        saveGoal(created);
        toast.success("Objectif créé");
      }
    }
    onClose();
  };

  const title = mode?.kind === "edit" ? "Modifier l'objectif" : mode?.kind === "renew" ? `Renouveler « ${goal?.name} »` : source ? "Nouvel objectif avec les fonds restants" : "Nouvel objectif d'épargne";
  return (
    <Dialog open={!!mode} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="goal-dialog" className="max-h-[92vh] overflow-y-auto rounded-3xl p-6 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
          <DialogDescription>
            {mode?.kind === "renew"
              ? "Fixez un nouveau montant cible ou une nouvelle date : les fonds déjà alloués restent sur l'objectif."
              : source
                ? `Les fonds de « ${source.name} » (${money(source.allocated)}) sont transférés vers ce nouvel objectif ; l'ancien est archivé.`
                : "Un objectif est une répartition virtuelle de votre compte d'épargne : il ne crée aucun solde bancaire."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nom" className="col-span-2">
            <Input data-testid="goal-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Vacances d'été" className={inputCls} />
          </Field>
          <div className="col-span-2">
            <p className="mb-1.5 text-xs font-semibold text-slate-600">Type d'objectif</p>
            <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-slate-100/80 p-1 sm:grid-cols-4" role="radiogroup">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  data-testid={`goal-kind-${k}`}
                  onClick={() => setKind(k)}
                  className={cn("rounded-xl px-2 py-2 text-left transition-[background-color,box-shadow] duration-200", kind === k ? "bg-white shadow-sm ring-1 ring-slate-200" : "hover:bg-white/60")}
                >
                  <span className="block text-xs font-bold text-slate-900">{KIND_LABELS[k].label}</span>
                  <span className="mt-0.5 hidden text-[10.5px] leading-tight text-slate-500 sm:block">{KIND_LABELS[k].hint}</span>
                </button>
              ))}
            </div>
          </div>
          {(kind === "target" || kind === "debt") && (
            <Field label={kind === "debt" ? "Montant total dû (€)" : "Montant cible (€)"}>
              <Input data-testid="goal-target-input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="3 000" className={inputCls} autoFocus={mode?.kind === "renew"} />
            </Field>
          )}
          <Field label={kind === "debt" ? "Mensualité (€)" : kind === "monthly" ? "Mensuel prévu (€)" : "Mensuel prévu (€, facultatif)"} className={kind === "target" || kind === "debt" ? "" : "col-span-2 sm:col-span-1"}>
            <Input data-testid="goal-monthly-input" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="100" className={inputCls} />
          </Field>
          {(kind === "open" || kind === "monthly") && (
            <Field label="Minimum souhaité (€, facultatif)" className="col-span-2 sm:col-span-1" hint="Le seuil à garder au minimum sur cet objectif">
              <Input data-testid="goal-minimum-input" inputMode="decimal" value={minimum} onChange={(e) => setMinimum(e.target.value)} placeholder="500" className={inputCls} />
            </Field>
          )}
          <Field label="Compte / Pocket lié (facultatif)" className="col-span-2 sm:col-span-1">
            <NativeSelect testid="goal-account-select" value={accountId} onChange={setAccountId} options={accounts.map((a) => ({ value: a.id, label: a.name }))} placeholder="Aucun" />
          </Field>
          {kind !== "open" && kind !== "debt" && (
            <Field label={kind === "monthly" ? "Date de fin (facultative)" : "Date cible (facultative)"} className={kind === "target" ? "col-span-2" : "col-span-2 sm:col-span-1"}>
              <Input data-testid="goal-date-input" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className={inputCls} />
            </Field>
          )}
          {goal ? (
            mode?.kind === "edit" && (
              <Field label="Statut" className="col-span-2 sm:col-span-1">
                <NativeSelect testid="goal-status-select" value={status} onChange={(v) => setStatus(v as GoalStatus)} options={(Object.keys(STATUS) as GoalStatus[]).map((k) => ({ value: k, label: STATUS[k].label }))} />
              </Field>
            )
          ) : (
            <Field label={source ? "Montant transféré (€)" : kind === "debt" ? "Déjà remboursé (€)" : "Déjà alloué (€)"} className="col-span-2 sm:col-span-1" hint={`Disponible : ${money(Math.max(0, available))}`}>
              <Input data-testid="goal-initial-input" inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} placeholder="0" className={inputCls} />
            </Field>
          )}
          <div className="col-span-2">
            <p className="mb-1.5 text-xs font-semibold text-slate-600">Priorité</p>
            <div className="flex gap-1.5">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  data-testid={`goal-priority-${p}`}
                  onClick={() => setPriority(p)}
                  className={cn("flex-1 rounded-xl px-3 py-2 text-xs font-semibold ring-1 ring-inset transition-[background-color,box-shadow,transform] duration-200 active:scale-[0.98]", priority === p ? PRIORITY[p].cls + " ring-2" : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50")}
                >
                  {PRIORITY[p].label}
                </button>
              ))}
            </div>
          </div>
          <div className="col-span-2">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-600">Icône et couleur</p>
              <button type="button" data-testid="goal-customize-toggle" onClick={() => setCustom((c) => !c)} className="flex items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900">
                <Wand2 className="size-3.5" /> Personnaliser <ChevronDown className={cn("size-3.5 transition-transform duration-200", custom && "rotate-180")} />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ICONS.map((i) => (
                <button key={i} type="button" data-testid={`goal-icon-${i}`} onClick={() => setIcon(i)} className={cn("grid size-9 place-items-center rounded-xl text-lg transition-transform hover:scale-105", icon === i ? "bg-slate-900/10 ring-2 ring-slate-900" : "bg-slate-50")}>
                  {i}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {COLORS.map((c) => (
                <button key={c} type="button" aria-label={`Couleur ${c}`} data-testid={`goal-color-${c.slice(1)}`} onClick={() => setColor(c)} className={cn("size-7 rounded-full transition-transform hover:scale-110", color === c && "ring-2 ring-offset-2 ring-slate-900")} style={{ background: c }} />
              ))}
            </div>
            {custom && (
              <div data-testid="goal-custom-section" className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-3 animate-rise">
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  Emoji
                  <Input data-testid="goal-custom-emoji-input" value={ICONS.includes(icon) ? "" : icon} onChange={(e) => setIcon(e.target.value.slice(0, 8) || ICONS[0])} placeholder="🌱" className="h-9 w-16 rounded-xl bg-white text-center text-lg" />
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  Couleur
                  <input data-testid="goal-custom-color-input" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded-xl border border-slate-200 bg-white p-1" />
                </label>
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  Aperçu
                  <span className="grid size-9 place-items-center rounded-xl text-lg" style={{ background: color + "22" }}>
                    {icon}
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="-mx-6 -mb-6 rounded-b-3xl px-6">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button data-testid="goal-save-button" onClick={submit}>
            {goal ? (mode?.kind === "renew" ? "Renouveler" : "Enregistrer") : "Créer l'objectif"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Allocation simple ---------------- */
function AllocateDialog({ goal, mode, onClose, unallocated }: { goal: Goal | null; mode: "add" | "remove"; onClose: () => void; unallocated: number }) {
  const [amount, setAmount] = useState("");
  useEffect(() => setAmount(""), [goal]);
  const max = mode === "add" ? Math.max(0, unallocated) : (goal?.allocated ?? 0);
  const a = parseAmount(amount) ?? 0;
  const tooMuch = a > max + EPS;
  const submit = () => {
    if (!goal || !a || a <= 0) return toast.error("Indiquez un montant positif");
    if (tooMuch) return toast.error(mode === "add" ? `Le solde non alloué disponible est de ${money(max)}` : "Vous ne pouvez pas désallouer plus que le montant alloué");
    allocate({ [goal.id]: mode === "add" ? a : -a });
    toast.success(mode === "add" ? `${money(a)} alloués à « ${goal.name} »` : `${money(a)} désalloués de « ${goal.name} »`);
    onClose();
  };
  return (
    <Dialog open={!!goal} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="allocate-dialog" className="rounded-3xl p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {mode === "add" ? "Allouer à" : "Désallouer de"} « {goal?.name} »
          </DialogTitle>
          <DialogDescription>{mode === "add" ? `Non alloué disponible : ${money(max)}` : `Alloué actuellement : ${money(max)}`}</DialogDescription>
        </DialogHeader>
        <Field label="Montant (€)">
          <div className="flex gap-2">
            <Input data-testid="allocate-amount-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} autoFocus />
            <Button variant="outline" className="h-10 rounded-xl" data-testid="allocate-max-button" disabled={max <= 0} onClick={() => setAmount(fr(max))}>
              Max
            </Button>
          </div>
        </Field>
        {(tooMuch || a < 0) && (
          <p data-testid="allocate-over-warning" className="flex items-center gap-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800">
            <AlertTriangle className="size-4 shrink-0" /> {a < 0 ? "Les montants négatifs ne sont pas acceptés." : mode === "add" ? `Maximum ${money(max)} : vous ne pouvez pas allouer plus que le solde non alloué.` : `Maximum ${money(max)}.`}
          </p>
        )}
        <DialogFooter className="-mx-6 -mb-6 rounded-b-3xl px-6">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button data-testid="allocate-confirm-button" disabled={tooMuch || a <= 0} onClick={submit}>
            {mode === "add" ? "Allouer" : "Désallouer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PriorityChip({ g, testid }: { g: Goal; testid?: string }) {
  const p = PRIORITY[priorityOf(g)];
  return (
    <Chip testid={testid} className={p.cls}>
      {priorityOf(g) === "essential" && <Lock className="size-3" />}
      {p.label}
    </Chip>
  );
}

/* ---------------- Répartition d'un versement ---------------- */
function SplitDialog({ open, onClose, goals, unallocated }: { open: boolean; onClose: () => void; goals: Goal[]; unallocated: number }) {
  const today = todayIso();
  const [total, setTotal] = useState("");
  const [parts, setParts] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<string>("");
  const accts = useData().accounts.filter((a) => !a.archived && a.currency === "EUR");
  const [sourceAcc, setSourceAcc] = useState(accts.find((a) => a.type === "savings")?.id ?? "");
  useEffect(() => {
    if (open) {
      setTotal(unallocated > 0 ? fr(unallocated) : "");
      setParts({});
      setMethod("");
    }
  }, [open, unallocated]);
  const stats = useMemo(() => new Map(goals.map((g) => [g.id, goalStats(g, today)])), [goals, today]);
  const t = parseAmount(total) ?? 0;
  const values = goals.map((g) => parseAmount(parts[g.id] ?? "") ?? 0);
  const sum = round2(values.reduce((s, v) => s + v, 0));
  const hasNegative = values.some((v) => v < 0);
  const max = Math.max(0, unallocated);
  const overAvailable = t > max + EPS;
  const overTotal = sum > t + EPS;
  const left = round2(t - sum);

  const apply = (amounts: Record<string, number> | null, label: string) => {
    if (!amounts) return toast.error(label === "need" ? "Aucun objectif n'a de besoin mensuel (mensuel prévu ou requis)" : "Rien à répartir");
    const next: Record<string, string> = {};
    for (const g of goals) next[g.id] = amounts[g.id] ? fr(amounts[g.id]) : "";
    setParts(next);
    setMethod(label);
  };
  const run = (how: "equal" | "remaining" | "need" | "suggest") => {
    if (t <= 0) return toast.error("Indiquez d'abord le montant du versement");
    const eligible = goals.filter((g) => !stats.get(g.id)?.reached);
    if (how === "equal") apply(splitByWeights(eligible, eligible.map(() => 1), t, today), how);
    if (how === "remaining") apply(splitByWeights(eligible, eligible.map((g) => stats.get(g.id)?.remaining ?? 0), t, today), how);
    if (how === "need") apply(splitByNeed(eligible, t, today), how);
    if (how === "suggest") {
      const r = suggestAllocation(goals, t, today);
      apply(Object.keys(r.amounts).length ? r.amounts : null, how);
    }
  };
  const submit = () => {
    if (hasNegative) return toast.error("Les montants négatifs ne sont pas acceptés");
    if (overAvailable) return toast.error(`Le solde non alloué disponible est de ${money(max)}`);
    if (overTotal) return toast.error("Le total réparti dépasse le montant du versement");
    const amounts: Record<string, number> = {};
    goals.forEach((g, i) => values[i] > 0 && (amounts[g.id] = round2(values[i])));
    if (!Object.keys(amounts).length) return toast.error("Indiquez au moins un montant");
    allocate(amounts, sourceAcc || undefined);
    toast.success(`${money(sum)} répartis entre ${Object.keys(amounts).length} objectif${Object.keys(amounts).length > 1 ? "s" : ""}`, { description: left > 0 ? `${money(left)} restent dans le non alloué` : undefined });
    onClose();
  };
  const methods: { id: "suggest" | "need" | "equal" | "remaining"; label: string; icon?: ReactNode }[] = [
    { id: "suggest", label: "Suggérer", icon: <Sparkles /> },
    { id: "need", label: "Selon le besoin mensuel" },
    { id: "equal", label: "À parts égales" },
    { id: "remaining", label: "Au prorata du restant" },
  ];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="split-dialog" className="max-h-[92vh] overflow-y-auto rounded-3xl p-6 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Répartir un versement</DialogTitle>
          <DialogDescription>Répartissez un montant entre vos objectifs. Vous n'êtes pas obligé de tout répartir : le reste demeure dans le non alloué.</DialogDescription>
        </DialogHeader>
        <Field label="Montant du versement (€)" hint={`Non alloué disponible : ${money(max)}`}>
          <Input data-testid="split-total-input" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} className={cn(inputCls, "max-w-xs")} />
        </Field>
        <Field label="Provenance du versement">
          <NativeSelect testid="split-source-select" value={sourceAcc} onChange={setSourceAcc} options={accts.map((a) => ({ value: a.id, label: a.name }))} placeholder="Non précisée" className="max-w-xs" />
        </Field>
        <div className="flex flex-wrap gap-2">
          {methods.map((m) => (
            <Button key={m.id} variant={m.id === "suggest" ? "default" : "outline"} size="sm" className={cn("h-9 rounded-xl", method === m.id && m.id !== "suggest" && "ring-2 ring-slate-900/15")} data-testid={`split-${m.id}-button`} onClick={() => run(m.id)}>
              {m.icon}
              {m.label}
            </Button>
          ))}
        </div>
        {method === "suggest" && <p className="-mt-1 text-[11px] text-slate-500" data-testid="split-suggest-explain">Ordre suivi : essentiels → date cible proche → en retard sur le mensuel requis → importants → ouverts et bonus. Chaque objectif reçoit au plus son besoin du mois.</p>}
        <div className="space-y-2">
          {goals.map((g, i) => {
            const s = stats.get(g.id)!;
            return (
              <div key={g.id} data-testid="split-goal-row" className={cn("rounded-2xl bg-slate-50 p-3", priorityOf(g) === "essential" && "ring-1 ring-rose-200")}>
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl text-lg" style={{ background: g.color + "22" }}>
                    {g.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-slate-900">{g.name}</span>
                      <PriorityChip g={g} />
                      {s.reached && <Chip className={STATUS.reached.cls}>🎯 Atteint</Chip>}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500 tabular" data-testid="split-goal-meta">
                      Alloué {money(g.allocated)}
                      {s.target !== null && <> · Cible {money(s.target)} · Restant {money(s.remaining ?? 0)}</>}
                      {s.minimum !== null && <> · Minimum {money(s.minimum)}{s.minMissing ? ` (manque ${money(s.minMissing)})` : " ✓"}</>}
                      {s.planned > 0 && <> · Mensuel prévu {money(s.planned)}</>}
                      {s.required !== null && <> · Mensuel requis {money(s.required)}</>}
                    </p>
                  </div>
                  <Input
                    data-testid={`split-part-${g.id}`}
                    inputMode="decimal"
                    value={parts[g.id] ?? ""}
                    onChange={(e) => {
                      setParts((p) => ({ ...p, [g.id]: e.target.value }));
                      setMethod("");
                    }}
                    placeholder="0"
                    className={cn("h-9 w-24 shrink-0 rounded-xl bg-white text-right sm:w-28", values[i] < 0 && "border-rose-300 text-rose-700")}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white p-3 text-xs ring-1 ring-slate-100">
          <span className={cn("font-semibold tabular", overTotal ? "text-rose-700" : "text-slate-700")} data-testid="split-sum">
            Réparti : {money(sum)} / {money(t)}
          </span>
          <span className="text-slate-500 tabular" data-testid="split-left">
            Restera non alloué : {money(Math.max(0, round2(max - sum)))}
          </span>
        </div>
        {(overAvailable || overTotal || hasNegative) && (
          <p data-testid="split-error" className="flex items-center gap-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800">
            <AlertTriangle className="size-4 shrink-0" />
            {hasNegative ? "Les montants négatifs ne sont pas acceptés." : overAvailable ? `Le versement dépasse le non alloué disponible (${money(max)}).` : "Le total réparti dépasse le montant du versement."}
          </p>
        )}
        <DialogFooter className="-mx-6 -mb-6 rounded-b-3xl px-6">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button data-testid="split-confirm-button" disabled={overAvailable || overTotal || hasNegative || sum <= 0} onClick={submit}>
            Répartir {sum > 0 ? money(sum) : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Objectif atteint ---------------- */
interface CompletionHandlers {
  onRenew: (g: Goal) => void;
  onNewFrom: (g: Goal) => void;
}
function CompletionActions({ g, handlers, compact }: { g: Goal; handlers: CompletionHandlers; compact?: boolean }) {
  const today = todayIso();
  const archive = () => {
    saveGoal({ ...g, status: "archived", archivedAt: todayIso() });
    toast.success(`« ${g.name} » archivé`, { description: `Ses ${money(g.allocated)} restent alloués` });
  };
  const keep = () => {
    saveGoal({ ...g, reachedAck: true });
    toast.success("Fonds conservés sur l'objectif");
  };
  const release = () => {
    saveGoal({ ...g, allocated: 0, status: "archived", archivedAt: today, history: [...g.history, { date: today, amount: -g.allocated }] });
    toast.success(`${money(g.allocated)} remis dans le non alloué`, { description: `« ${g.name} » est archivé` });
  };
  const btn = "h-8 rounded-xl text-xs";
  return (
    <div data-testid="goal-completion" className={cn("rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3", compact && "mt-3")}>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-900">
        <CheckCircle2 className="size-4" /> Objectif atteint ! Que faire des {money(g.allocated)} ?
      </p>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Button size="sm" variant="outline" className={btn} data-testid="goal-complete-keep" onClick={keep}>
          <Lock /> Conserver
        </Button>
        <Button size="sm" variant="outline" className={btn} data-testid="goal-complete-archive" onClick={archive}>
          <Archive /> Archiver
        </Button>
        <Button size="sm" variant="outline" className={btn} data-testid="goal-complete-release" onClick={release}>
          <Undo2 /> Libérer les fonds
        </Button>
        <Button size="sm" variant="outline" className={btn} data-testid="goal-complete-renew" onClick={() => handlers.onRenew(g)}>
          <RefreshCcw /> Renouveler
        </Button>
        <Button size="sm" variant="outline" className={cn(btn, "col-span-2")} data-testid="goal-complete-new" onClick={() => handlers.onNewFrom(g)}>
          <Plus /> Nouvel objectif avec ces fonds
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Détail ---------------- */
function Metric({ label, value, testid, tone }: { label: string; value: string; testid: string; tone?: "warn" }) {
  return (
    <div className={cn("rounded-xl bg-white/80 p-2.5 ring-1 ring-slate-100", tone === "warn" && "bg-amber-50 ring-amber-200")}>
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className={cn("mt-0.5 text-sm font-semibold tabular text-slate-800", tone === "warn" && "text-amber-900")} data-testid={testid}>
        {value}
      </dd>
    </div>
  );
}

function goalMetrics(g: Goal, s: GoalStats, prefix: string) {
  const m: { label: string; value: string; testid: string; tone?: "warn" }[] = [{ label: "Alloué", value: money(g.allocated), testid: `${prefix}-allocated-metric` }];
  if (s.target !== null) {
    m.push({ label: "Cible", value: money(s.target), testid: `${prefix}-target` });
    m.push({ label: "Restant", value: money(s.remaining ?? 0), testid: `${prefix}-remaining` });
  }
  if (s.minimum !== null) {
    m.push({ label: "Minimum souhaité", value: money(s.minimum), testid: `${prefix}-minimum` });
    m.push({ label: "Manque pour le minimum", value: s.minMissing ? money(s.minMissing) : "Atteint ✓", testid: `${prefix}-min-missing`, tone: s.minMissing ? "warn" : undefined });
  }
  m.push({ label: "Mensuel prévu", value: s.planned ? `${money(s.planned)}/mois` : "—", testid: `${prefix}-planned` });
  if (s.target !== null) m.push({ label: "Mensuel requis", value: s.required !== null ? `${money(s.required)}/mois` : s.reached ? "Atteint" : "Pas de date cible", testid: `${prefix}-required`, tone: s.behind ? "warn" : undefined });
  if (s.projectedYear !== null) m.push({ label: "Projeté fin d'année", value: money(s.projectedYear), testid: `${prefix}-projected` });
  if (s.target !== null) m.push({ label: "Atteinte estimée", value: s.reached ? "Atteint 🎯" : s.eta ? fmtDate(s.eta) : "Aucun rythme", testid: `${prefix}-eta` });
  return m;
}

function DetailDialog({ goal, onClose, handlers, onEdit }: { goal: Goal | null; onClose: () => void; handlers: CompletionHandlers; onEdit: (g: Goal) => void }) {
  const accountsAll = useData().accounts;
  if (!goal) return null;
  const s = goalStats(goal);
  const accNameOf = (id: string) => accountsAll.find((a) => a.id === id)?.name ?? "—";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="goal-detail-dialog" className="max-h-[92vh] overflow-y-auto rounded-3xl p-6 sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl text-2xl" style={{ background: goal.color + "22" }}>
              {goal.icon}
            </span>
            <div>
              <DialogTitle className="text-xl font-bold">{goal.name}</DialogTitle>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Chip className="bg-white text-slate-600 ring-slate-200">{KIND_LABELS[s.kind].label}</Chip>
                <PriorityChip g={goal} />
                {goal.status !== "active" && <Chip className={STATUS[goal.status].cls}>{STATUS[goal.status].label}</Chip>}
              </div>
            </div>
          </div>
          <DialogDescription className="pt-2" data-testid="goal-detail-status-line">
            {goalStatusLine(goal, s)}
          </DialogDescription>
        </DialogHeader>
        {s.progress !== null && (
          <div>
            <ProgressBar value={s.progress} color={goal.color} />
            <p className="mt-1 text-xs font-semibold text-slate-600">{Math.round(s.progress * 100)} %</p>
          </div>
        )}
        {s.minimum !== null && <MinimumBar g={goal} s={s} />}
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {goalMetrics(goal, s, "goal-detail").map((m) => (
            <Metric key={m.testid} {...m} />
          ))}
        </dl>
        {s.behind && <BehindWarning />}
        {goal.targetDate && <p className="text-xs text-slate-500">{s.kind === "monthly" ? "Date de fin" : "Date cible"} : {fmtDate(goal.targetDate)}{s.pace ? ` · rythme réel ${money(s.pace)}/mois (90 j)` : ""}</p>}
        {s.reached && goal.status !== "archived" && <CompletionActions g={goal} handlers={handlers} />}
        <div>
          <p className="mb-1.5 text-xs font-semibold text-slate-600">Historique des allocations</p>
          {goal.history.length === 0 ? (
            <p className="text-xs text-slate-400">Aucune allocation pour l'instant.</p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto pr-1" data-testid="goal-history">
              {[...goal.history].reverse().map((h, i) => (
                <li key={i} className="flex justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs">
                  <span className="text-slate-500">
                    {fmtDate(h.date)}
                    {h.source && <span className="ml-1.5 text-slate-400">· {accNameOf(h.source)}</span>}
                  </span>
                  <span className={cn("font-semibold tabular", h.amount >= 0 ? "text-emerald-700" : "text-slate-700")}>{money(h.amount, "EUR", true)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter className="-mx-6 -mb-6 rounded-b-3xl px-6">
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
          <Button data-testid="goal-detail-edit" onClick={() => onEdit(goal)}>
            <Pencil /> Modifier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MinimumBar({ g, s }: { g: Goal; s: GoalStats }) {
  const min = s.minimum ?? 0;
  const ok = !s.minMissing;
  return (
    <div className="mt-2" data-testid="goal-minimum">
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full transition-[width] duration-500", ok ? "bg-emerald-500" : "bg-amber-400")} style={{ width: `${Math.min(100, (g.allocated / min) * 100)}%` }} />
      </div>
      <p className={cn("mt-1 text-[11px] font-medium", ok ? "text-emerald-700" : "text-amber-800")} data-testid="goal-minimum-label">
        {ok ? `Minimum souhaité atteint (${money(min)}) ✓` : `Minimum souhaité ${money(min)} · il manque ${money(s.minMissing ?? 0)}`}
      </p>
    </div>
  );
}

function BehindWarning() {
  return (
    <p data-testid="goal-behind-warning" className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
      <AlertTriangle className="size-3.5 shrink-0" /> À ce rythme, la date cible ne sera pas atteinte.
    </p>
  );
}

/* ---------------- Carte ---------------- */
function GoalCard({ g, onDetail, onEdit, onAlloc, onDelete, handlers }: { g: Goal; onDetail: () => void; onEdit: () => void; onAlloc: (mode: "add" | "remove") => void; onDelete: () => void; handlers: CompletionHandlers }) {
  const accountsList = useData().accounts;
  const s = goalStats(g);
  const accName = (id: string) => accountsList.find((a) => a.id === id)?.name ?? "—";
  const saved = round2(g.history.filter((h) => h.amount > 0).reduce((a, h) => a + h.amount, 0));
  const lastMove = g.history.length ? g.history[g.history.length - 1].date : g.createdAt.slice(0, 10);
  const months = Math.max(0, Math.round(monthsBetween(g.createdAt.slice(0, 10), g.archivedAt ?? lastMove)));
  const essential = priorityOf(g) === "essential";
  const archived = g.status === "archived" || g.status === "abandoned";
  return (
    <div
      data-testid="goal-card"
      data-priority={priorityOf(g)}
      data-kind={s.kind}
      className={cn("relative overflow-hidden rounded-3xl border p-5 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md", essential ? "border-rose-200/80" : "border-slate-100", archived && "opacity-60")}
      style={{ background: `linear-gradient(160deg, ${g.color}12, #ffffff 55%)` }}
    >
      {essential && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-rose-400" />}
      <div className="flex items-start justify-between gap-2">
        <button className="flex min-w-0 items-center gap-3 text-left" onClick={onDetail} data-testid="goal-open-detail">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl text-xl" style={{ background: g.color + "22" }}>
            {g.icon}
          </span>
          <div className="min-w-0">
            <p data-testid="goal-name" className="truncate font-bold text-slate-900 hover:underline">
              {g.name}
            </p>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {s.reached ? (
                <Chip testid="goal-reached-badge" className={STATUS.reached.cls}>
                  🎯 Atteint
                </Chip>
              ) : (
                g.status !== "active" && <Chip className={STATUS[g.status].cls}>{STATUS[g.status].label}</Chip>
              )}
              <PriorityChip g={g} testid="goal-priority" />
              {s.kind !== "target" && <Chip className="bg-white text-slate-500 ring-slate-200">{s.kind === "open" ? "Ouvert" : s.kind === "debt" ? "Dette" : "Mensuel"}</Chip>}
              {g.accountId && <Chip testid="goal-account-chip" className="bg-white text-slate-500 ring-slate-200">{accName(g.accountId)}</Chip>}
            </div>
          </div>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" data-testid="goal-actions-button" aria-label="Actions" />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem data-testid="goal-detail" onClick={onDetail}>
              <Scale /> Détail
            </DropdownMenuItem>
            <DropdownMenuItem data-testid="goal-edit" onClick={onEdit}>
              <Pencil /> Modifier
            </DropdownMenuItem>
            {g.status !== "archived" ? (
              <DropdownMenuItem data-testid="goal-archive" onClick={() => saveGoal({ ...g, status: "archived", archivedAt: todayIso() })}>
                <Archive /> Archiver
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem data-testid="goal-unarchive" onClick={() => saveGoal(syncGoalStatus({ ...g, status: "active" }))}>
                <Undo2 /> Réactiver
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" data-testid="goal-delete" onClick={onDelete}>
              <Trash2 /> Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Alloué</p>
          <p className="text-2xl font-extrabold tabular text-slate-900" data-testid="goal-allocated">
            {money(g.allocated)}
          </p>
        </div>
        {s.target !== null && (
          <p className="text-sm text-slate-500 tabular" data-testid="goal-target">
            Cible {money(s.target)}
          </p>
        )}
      </div>
      {s.progress !== null && (
        <div className="mt-2">
          <ProgressBar value={s.progress} color={s.reached ? "#10B981" : g.color} testid="goal-progress" />
          <div className="mt-1.5 flex justify-between text-xs text-slate-500">
            <span data-testid="goal-percent" className="font-semibold text-slate-700">
              {Math.round(s.progress * 100)} %
            </span>
            <span>Restant {money(s.remaining ?? 0)}</span>
          </div>
        </div>
      )}
      {s.minimum !== null && <MinimumBar g={g} s={s} />}
      <p data-testid="goal-status-line" className="mt-3 text-[13px] font-medium leading-snug text-slate-700">
        {goalStatusLine(g, s)}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        {s.target !== null ? (
          <>
            <Metric label="Mensuel requis" value={s.required !== null ? money(s.required) : s.reached ? "—" : "Pas de date"} testid="goal-per-month" tone={s.behind ? "warn" : undefined} />
            <Metric label="Atteinte estimée" value={s.reached ? "Atteint 🎯" : s.eta ? fmtDate(s.eta) : "Aucun rythme"} testid="goal-eta" />
          </>
        ) : (
          <>
            <Metric label="Mensuel prévu" value={s.planned ? `${money(s.planned)}` : "—"} testid="goal-planned" />
            <Metric label="Projeté fin d'année" value={s.projectedYear !== null ? money(s.projectedYear) : "—"} testid="goal-projected" />
          </>
        )}
      </dl>
      {s.behind && (
        <div className="mt-2">
          <BehindWarning />
        </div>
      )}
      {s.reached && !archived && !g.reachedAck && <CompletionActions g={g} handlers={handlers} compact />}
      {archived && (
        <p data-testid="goal-archived-summary" className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Épargné au total <b className="tabular text-slate-900">{money(saved)}</b> · durée {months} mois
        </p>
      )}
      {!archived && (
        <div className="mt-4 flex gap-2">
          <Button size="sm" data-testid="goal-allocate-button" className="flex-1 rounded-xl" onClick={() => onAlloc("add")}>
            <ArrowDownToLine /> Allouer
          </Button>
          <Button size="sm" variant="outline" data-testid="goal-deallocate-button" className="flex-1 rounded-xl" disabled={g.allocated <= 0} onClick={() => onAlloc("remove")}>
            <ArrowUpFromLine /> Désallouer
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Page ---------------- */
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
  const interest = useMemo(() => interestEstimate(data, today), [data, today]);
  const interestAll = round2(data.transactions.filter((t) => savingsAccounts.some((a) => a.id === t.accountId) && t.category === "Intérêts").reduce((s, t) => s + t.amount, 0));
  const activeOnly = data.goals.filter((g) => g.status === "active");
  const plannedMonthly = round2(activeOnly.reduce((s, g) => s + goalStats(g, today).planned, 0));
  const plannedRest = round2(activeOnly.reduce((s, g) => {
    const st = goalStats(g, today);
    return s + (st.projectedYear !== null ? st.projectedYear - g.allocated : 0);
  }, 0));
  const projected = round2(real + plannedRest + (interest?.total ?? 0));

  const [dialog, setDialog] = useState<DialogMode | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [alloc, setAlloc] = useState<{ goal: Goal | null; mode: "add" | "remove" }>({ goal: null, mode: "add" });
  const [splitOpen, setSplitOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Goal | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const sortGoals = (list: Goal[]) => [...list].sort((a, b) => PRIORITY[priorityOf(a)].rank - PRIORITY[priorityOf(b)].rank || (a.targetDate ?? "9999").localeCompare(b.targetDate ?? "9999"));
  const current = sortGoals(data.goals.filter((g) => g.status !== "archived" && g.status !== "abandoned"));
  const archived = sortGoals(data.goals.filter((g) => g.status === "archived" || g.status === "abandoned"));
  const splitGoals = data.goals.filter((g) => g.status === "active" || g.status === "paused" || g.status === "reached");
  const detailGoal = data.goals.find((g) => g.id === detail) ?? null;
  const handlers: CompletionHandlers = {
    onRenew: (g) => {
      setDetail(null);
      setDialog({ kind: "renew", goal: g });
    },
    onNewFrom: (g) => {
      setDetail(null);
      setDialog({ kind: "from", source: g });
    },
  };
  const card = (g: Goal) => <GoalCard key={g.id} g={g} handlers={handlers} onDetail={() => setDetail(g.id)} onEdit={() => setDialog({ kind: "edit", goal: g })} onAlloc={(mode) => setAlloc({ goal: g, mode })} onDelete={() => setToDelete(g)} />;
  const over = unallocated < -EPS;

  return (
    <div>
      <PageHeader eyebrow="Compte d'épargne" title="Épargne et objectifs" subtitle="Fragmentez virtuellement votre compte d'épargne en objectifs. Les intérêts restent dans le solde réel ; les objectifs ne créent aucun faux solde." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard testid="savings-real-card" tone="savings" label="Solde réel du compte d'épargne" value={money(real)} icon={<PiggyBank className="size-4 text-amber-700" />} sub={`Intérêts nets ${today.slice(0, 4)} : ${money(interestYear)}`} />
        <StatCard testid="savings-allocated-card" tone="net" label="Alloué aux objectifs" value={money(allocated)} sub={`${counted.length} objectif${counted.length > 1 ? "s" : ""} (hors abandonnés)`} />
        <StatCard testid="savings-unallocated-card" tone={over ? "expense" : "income"} label="Non alloué" value={money(unallocated, "EUR")} sub={`${over ? "Vos objectifs dépassent le solde réel" : "Disponible pour vos objectifs"} · dont intérêts cumulés ${money(interestAll)} (suivis à part)`} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard testid="savings-planned-card" label="Épargne mensuelle prévue" value={money(plannedMonthly)} sub={`Somme des mensuels prévus · ${activeOnly.length} objectif${activeOnly.length > 1 ? "s" : ""} actif${activeOnly.length > 1 ? "s" : ""}`} />
        <StatCard
          testid="savings-projected-card"
          label="Solde projeté fin d'année"
          value={money(projected)}
          sub={
            <>
              Réel {money(real)} + versements prévus {money(plannedRest)}
              {interest ? ` + intérêts estimés ${money(interest.total)}` : " · pas de données d'intérêts"}
            </>
          }
        />
        <StatCard
          testid="savings-allocation-status-card"
          tone={over ? "expense" : "plain"}
          label="État de la répartition"
          value={over ? `Sur-allocation de ${money(-unallocated)}` : "Équilibré"}
          icon={over ? <AlertTriangle className="size-4 text-rose-700" /> : <Scale className="size-4 text-emerald-700" />}
          sub={over ? "Total alloué supérieur au solde réel" : "Total alloué ≤ solde réel"}
          className={cn(over ? "" : "[&_[data-testid=savings-allocation-status-card-value]]:text-emerald-700")}
        />
      </div>

      {over && (
        <div data-testid="over-allocation-alert" className="mt-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 animate-rise">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Sur-allocation de {money(-unallocated)}</p>
            <p className="text-rose-800/80">La somme des objectifs dépasse le solde réel du compte d'épargne. Désallouez un montant ou alimentez votre épargne — rien n'est bloqué.</p>
          </div>
        </div>
      )}

      <Panel className="mt-5" testid="goals-panel">
        <PanelTitle
          sub="Essentiels en premier, puis par date cible"
          aside={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" data-testid="split-open-button" disabled={!splitGoals.length} onClick={() => setSplitOpen(true)} className="h-9 rounded-xl">
                <Split /> Répartir un versement
              </Button>
              <Button data-testid="new-goal-button" onClick={() => setDialog({ kind: "create" })} className="h-9 rounded-xl">
                <Plus /> Nouvel objectif
              </Button>
            </div>
          }
        >
          Objectifs d'épargne
        </PanelTitle>
        {current.length === 0 ? (
          <EmptyState
            testid="goals-empty-state"
            icon={<PiggyBank className="size-5" />}
            title="Aucun objectif en cours"
            text="Créez un objectif cible, ouvert ou mensuel (vacances, fonds d'urgence…) puis allouez-lui une partie de votre épargne."
            action={<Button onClick={() => setDialog({ kind: "create" })}>Créer un objectif</Button>}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{current.map(card)}</div>
        )}
        {archived.length > 0 && (
          <div className="mt-6">
            <button data-testid="archived-toggle" onClick={() => setShowArchived((v) => !v)} className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-900">
              <ChevronDown className={cn("size-4 transition-transform duration-200", showArchived && "rotate-180")} /> Archivés ({archived.length})
            </button>
            {showArchived && <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{archived.map(card)}</div>}
          </div>
        )}
      </Panel>

      <GoalDialog mode={dialog} unallocated={unallocated} onClose={() => setDialog(null)} />
      <DetailDialog
        goal={detailGoal}
        handlers={handlers}
        onClose={() => setDetail(null)}
        onEdit={(g) => {
          setDetail(null);
          setDialog({ kind: "edit", goal: g });
        }}
      />
      <AllocateDialog goal={alloc.goal} mode={alloc.mode} unallocated={unallocated} onClose={() => setAlloc({ goal: null, mode: "add" })} />
      <SplitDialog open={splitOpen} onClose={() => setSplitOpen(false)} goals={splitGoals} unallocated={unallocated} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Supprimer cet objectif ?"
        description={`« ${toDelete?.name} » sera supprimé et son montant alloué (${money(toDelete?.allocated ?? 0)}) redeviendra non alloué.`}
        onConfirm={() => {
          if (toDelete) deleteGoal(toDelete.id);
          toastUndo("Objectif supprimé");
        }}
      />
    </div>
  );
}

