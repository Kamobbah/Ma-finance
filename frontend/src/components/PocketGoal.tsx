import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, PiggyBank, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog, EmptyState, Field, Panel, PanelTitle, ProgressBar, inputCls } from "@/components/kit";
import { saveAccount, useData } from "@/lib/store";
import { accountBalance } from "@/lib/analytics";
import { fmtDate, fromIso, money, round2, todayIso, toIso } from "@/lib/format";
import { parseAmount } from "@/lib/csv";
import type { Account } from "@/lib/types";

export function pocketGoalStats(acc: Account, balance: number, monthlyNet: number, today = todayIso()) {
  const g = acc.goal!;
  const progress = g.target > 0 ? Math.max(0, balance) / g.target : 0;
  const remaining = round2(Math.max(0, g.target - balance));
  let perMonth: number | null = null;
  if (g.targetDate) {
    const a = fromIso(today);
    const b = fromIso(g.targetDate);
    const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() - a.getDate()) / 30;
    perMonth = months > 0 ? round2(remaining / Math.max(1, months)) : remaining;
  }
  let eta: string | null = remaining === 0 ? today : null;
  if (!eta && monthlyNet > 0) {
    const d = fromIso(today);
    d.setDate(d.getDate() + Math.ceil((remaining / monthlyNet) * 30.4));
    eta = toIso(d);
  }
  return { progress, remaining, perMonth, eta };
}

/** Variation nette moyenne du solde sur les 3 derniers mois. */
export function monthlyNetPace(acc: Account, data: ReturnType<typeof useData>, today = todayIso()) {
  const d = fromIso(today);
  d.setMonth(d.getMonth() - 3);
  const from = toIso(d);
  return round2((accountBalance(acc, data.transactions, today) - accountBalance(acc, data.transactions, from)) / 3);
}

function GoalDialog({ acc, open, onClose }: { acc: Account; open: boolean; onClose: () => void }) {
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState("");
  const [date, setDate] = useState("");
  useEffect(() => {
    if (!open) return;
    setLabel(acc.goal?.label ?? "");
    setTarget(acc.goal ? String(acc.goal.target).replace(".", ",") : "");
    setDate(acc.goal?.targetDate ?? "");
  }, [open, acc.goal]);
  const submit = () => {
    const t = parseAmount(target);
    if (!t || t <= 0) return toast.error("Indiquez un montant cible positif");
    saveAccount({ ...acc, goal: { target: round2(t), targetDate: date || undefined, label: label.trim() || undefined } });
    toast.success("Objectif de la Pocket enregistré");
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="pocket-goal-dialog" className="rounded-3xl p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Tirelire · {acc.name}</DialogTitle>
          <DialogDescription>La jauge suit le solde réel de la Pocket par rapport à votre objectif.</DialogDescription>
        </DialogHeader>
        <Field label="Intitulé (facultatif)">
          <Input data-testid="pocket-goal-label-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex. Entretien voiture" className={inputCls} />
        </Field>
        <Field label="Montant cible (€)">
          <Input data-testid="pocket-goal-target-input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="1 000" className={inputCls} />
        </Field>
        <Field label="Date cible (facultative)">
          <Input data-testid="pocket-goal-date-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        <DialogFooter className="-mx-6 -mb-6 rounded-b-3xl px-6">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button data-testid="pocket-goal-save-button" onClick={submit}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PocketGoalPanel({ acc }: { acc: Account }) {
  const data = useData();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const balance = accountBalance(acc, data.transactions);
  const pace = monthlyNetPace(acc, data);

  return (
    <Panel className="mt-5" testid="pocket-goal-panel">
      <PanelTitle
        sub="Un objectif pour cette Pocket, suivi sur son solde réel"
        aside={
          acc.goal ? (
            <div className="flex gap-1">
              <Button variant="ghost" size="icon-sm" aria-label="Modifier l'objectif" data-testid="pocket-goal-edit" onClick={() => setOpen(true)}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Supprimer l'objectif" data-testid="pocket-goal-delete" onClick={() => setConfirm(true)}>
                <Trash2 />
              </Button>
            </div>
          ) : undefined
        }
      >
        <span className="flex items-center gap-2">
          <PiggyBank className="size-4" style={{ color: acc.color }} /> Tirelire
        </span>
      </PanelTitle>
      {!acc.goal ? (
        <EmptyState testid="pocket-goal-empty" title="Pas encore d'objectif" text="Fixez un montant à atteindre pour cette Pocket et suivez votre progression." action={<Button data-testid="pocket-goal-create" onClick={() => setOpen(true)}>Définir un objectif</Button>} />
      ) : (
        (() => {
          const s = pocketGoalStats(acc, balance, pace);
          return (
            <div className="grid gap-5 md:grid-cols-[1.4fr_1fr] md:items-center">
              <div>
                {acc.goal.label && <p className="mb-1 text-sm font-semibold text-slate-700">{acc.goal.label}</p>}
                <div className="flex items-baseline justify-between">
                  <p data-testid="pocket-goal-balance" className="text-3xl font-extrabold tabular text-slate-900">
                    {money(balance)}
                  </p>
                  <p className="text-sm text-slate-500 tabular">/ {money(acc.goal.target)}</p>
                </div>
                <div className="mt-3 h-4 overflow-hidden rounded-full bg-slate-100" data-testid="pocket-goal-gauge">
                  <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${Math.min(100, s.progress * 100)}%`, background: `linear-gradient(90deg, ${acc.color}99, ${acc.color})` }} />
                </div>
                <div className="mt-2 flex justify-between text-xs text-slate-500">
                  <span data-testid="pocket-goal-percent" className="font-bold" style={{ color: acc.color }}>
                    {Math.round(s.progress * 100)} %
                  </span>
                  <span>{s.remaining === 0 ? "Objectif atteint 🎉" : `Reste ${money(s.remaining)}`}</span>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <dt className="text-slate-500">À verser / mois</dt>
                  <dd data-testid="pocket-goal-per-month" className="mt-0.5 font-semibold text-slate-800">
                    {s.perMonth !== null ? money(s.perMonth) : "Pas de date cible"}
                  </dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <dt className="text-slate-500">Atteinte estimée</dt>
                  <dd data-testid="pocket-goal-eta" className="mt-0.5 font-semibold text-slate-800">
                    {s.remaining === 0 ? "Atteint" : s.eta ? fmtDate(s.eta) : "Rythme insuffisant"}
                  </dd>
                </div>
                <div className="col-span-2 rounded-2xl bg-slate-50 p-3">
                  <dt className="text-slate-500">Rythme actuel (3 derniers mois)</dt>
                  <dd className="mt-0.5 font-semibold text-slate-800">
                    {money(pace, "EUR", true)} / mois{acc.goal.targetDate ? ` · cible le ${fmtDate(acc.goal.targetDate)}` : ""}
                  </dd>
                </div>
              </dl>
            </div>
          );
        })()
      )}
      <GoalDialog acc={acc} open={open} onClose={() => setOpen(false)} />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Supprimer l'objectif de cette Pocket ?"
        description="Le solde et les opérations de la Pocket ne sont pas modifiés."
        onConfirm={() => {
          saveAccount({ ...acc, goal: undefined });
          toast.success("Objectif supprimé");
        }}
      />
    </Panel>
  );
}

export function PocketGoalMini({ acc, balance }: { acc: Account; balance: number }) {
  if (!acc.goal) return null;
  const p = acc.goal.target > 0 ? Math.max(0, balance) / acc.goal.target : 0;
  return (
    <div className="mt-3" data-testid={`account-card-goal-${acc.id}`}>
      <div className="mb-1 flex justify-between text-[11px] text-slate-500">
        <span>🎯 {acc.goal.label ?? "Objectif"}</span>
        <span className="font-semibold">
          {Math.round(p * 100)} % de {money(acc.goal.target)}
        </span>
      </div>
      <ProgressBar value={p} color={acc.color} />
    </div>
  );
}
