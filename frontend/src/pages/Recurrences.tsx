import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CalendarClock, MoreHorizontal, Pause, Pencil, Play, Plus, Repeat, Square, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Amount, Chip, ConfirmDialog, EmptyState, Field, NativeSelect, PageHeader, Panel, StatCard, inputCls } from "@/components/kit";
import { deleteRecurrence, saveRecurrence, useData } from "@/lib/store";
import { accountOptions, categoryOptions } from "@/lib/ui";
import { forecast, frequencyLabel } from "@/lib/recurrence";
import { fmtDate, money, round2, todayIso, uid } from "@/lib/format";
import { parseAmount } from "@/lib/csv";
import type { EndMode, Frequency, Recurrence, RecurrenceStatus } from "@/lib/types";

const STATUS: Record<RecurrenceStatus, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  paused: { label: "En pause", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  ended: { label: "Terminée", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
};

function endLabel(r: Recurrence) {
  switch (r.endMode) {
    case "never":
      return "Jamais";
    case "date":
      return `Le ${fmtDate(r.endDate ?? "")}`;
    case "count":
      return `Après ${r.maxCount} occurrences (${r.occurrences} faites)`;
    case "amount":
      return `À ${money(r.targetAmount ?? 0)} cumulés (${money(r.cumulated)})`;
  }
}

function RecurrenceDialog({ open, rec, onClose }: { open: boolean; rec: Recurrence | null; onClose: () => void }) {
  const data = useData();
  const [f, setF] = useState<Recurrence | null>(null);
  const [amount, setAmount] = useState("");
  const [target, setTarget] = useState("");
  useEffect(() => {
    if (!open) return;
    const today = todayIso();
    const base: Recurrence = rec ?? {
      id: uid(),
      name: "",
      amount: 0,
      accountId: data.accounts.find((a) => a.type === "main")?.id ?? data.accounts[0]?.id ?? "",
      category: "Abonnements & numérique",
      type: "expense",
      frequency: "monthly",
      interval: 1,
      intervalUnit: "months",
      startDate: today,
      nextDate: today,
      endMode: "never",
      status: "active",
      occurrences: 0,
      cumulated: 0,
    };
    setF(base);
    setAmount(base.amount ? String(base.amount).replace(".", ",") : "");
    setTarget(base.targetAmount ? String(base.targetAmount).replace(".", ",") : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rec]);
  if (!f) return null;
  const set = (patch: Partial<Recurrence>) => setF({ ...f, ...patch });

  const submit = () => {
    const a = parseAmount(amount);
    if (!f.name.trim()) return toast.error("Donnez un nom à la récurrence");
    if (!a || a <= 0) return toast.error("Indiquez un montant positif");
    if (f.endMode === "date" && !f.endDate) return toast.error("Choisissez la date de fin");
    if (f.endMode === "count" && !f.maxCount) return toast.error("Indiquez le nombre d'occurrences");
    const t = parseAmount(target);
    if (f.endMode === "amount" && !t) return toast.error("Indiquez le montant cumulé cible");
    const next: Recurrence = { ...f, name: f.name.trim(), amount: round2(a), targetAmount: f.endMode === "amount" ? (t ?? undefined) : undefined, nextDate: f.nextDate < f.startDate ? f.startDate : f.nextDate };
    if (next.status === "ended" && rec?.status === "ended" && next.endMode !== rec.endMode) next.status = "active";
    const created = saveRecurrence(next);
    toast.success(rec ? "Récurrence modifiée" : "Récurrence créée", { description: created ? `${created} opération(s) échue(s) créée(s) automatiquement` : undefined });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="recurrence-dialog" className="max-h-[92vh] overflow-y-auto rounded-3xl p-6 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{rec ? "Modifier la récurrence" : "Nouvelle récurrence"}</DialogTitle>
          <DialogDescription>Les échéances dues sont créées automatiquement à l'ouverture de l'application.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nom" className="col-span-2">
            <Input data-testid="rec-name-input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="ex. Loyer, Netflix, Salaire…" className={inputCls} />
          </Field>
          <Field label="Type">
            <NativeSelect testid="rec-type-select" value={f.type} onChange={(v) => set({ type: v as "income" | "expense" })} options={[{ value: "expense", label: "Dépense" }, { value: "income", label: "Revenu" }]} />
          </Field>
          <Field label="Montant (€)">
            <Input data-testid="rec-amount-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="9,99" className={inputCls} />
          </Field>
          <Field label="Compte ou Pocket">
            <NativeSelect testid="rec-account-select" value={f.accountId} onChange={(v) => set({ accountId: v })} options={accountOptions(data.accounts)} />
          </Field>
          <Field label="Catégorie">
            <NativeSelect testid="rec-category-select" value={f.category} onChange={(v) => set({ category: v })} options={categoryOptions(data)} />
          </Field>
          <Field label="Fréquence">
            <NativeSelect
              testid="rec-frequency-select"
              value={f.frequency}
              onChange={(v) => set({ frequency: v as Frequency })}
              options={[
                { value: "daily", label: "Quotidienne" },
                { value: "weekly", label: "Hebdomadaire" },
                { value: "monthly", label: "Mensuelle" },
                { value: "yearly", label: "Annuelle" },
                { value: "custom", label: "Intervalle personnalisé" },
              ]}
            />
          </Field>
          {f.frequency === "custom" ? (
            <div className="flex items-end gap-2">
              <Field label="Tous les">
                <Input data-testid="rec-interval-input" type="number" min={1} value={f.interval} onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })} className={inputCls + " w-20"} />
              </Field>
              <NativeSelect testid="rec-interval-unit" value={f.intervalUnit} onChange={(v) => set({ intervalUnit: v as Recurrence["intervalUnit"] })} options={[{ value: "days", label: "jours" }, { value: "weeks", label: "semaines" }, { value: "months", label: "mois" }]} />
            </div>
          ) : (
            <div />
          )}
          <Field label="Date de début">
            <Input data-testid="rec-start-input" type="date" value={f.startDate} onChange={(e) => set({ startDate: e.target.value, nextDate: rec ? f.nextDate : e.target.value })} className={inputCls} />
          </Field>
          <Field label="Prochaine échéance">
            <Input data-testid="rec-next-input" type="date" value={f.nextDate} onChange={(e) => set({ nextDate: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Condition de fin">
            <NativeSelect
              testid="rec-end-select"
              value={f.endMode}
              onChange={(v) => set({ endMode: v as EndMode })}
              options={[
                { value: "never", label: "Jamais" },
                { value: "date", label: "À une date précise" },
                { value: "count", label: "Après un nombre d'occurrences" },
                { value: "amount", label: "À un montant cumulé" },
              ]}
            />
          </Field>
          {f.endMode === "date" && (
            <Field label="Date de fin">
              <Input data-testid="rec-end-date-input" type="date" value={f.endDate ?? ""} onChange={(e) => set({ endDate: e.target.value })} className={inputCls} />
            </Field>
          )}
          {f.endMode === "count" && (
            <Field label="Nombre d'occurrences">
              <Input data-testid="rec-max-count-input" type="number" min={1} value={f.maxCount ?? ""} onChange={(e) => set({ maxCount: Number(e.target.value) || undefined })} className={inputCls} />
            </Field>
          )}
          {f.endMode === "amount" && (
            <Field label="Montant cumulé cible (€)">
              <Input data-testid="rec-target-input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} className={inputCls} />
            </Field>
          )}
          {f.endMode === "never" && <div />}
          {rec && (
            <Field label="Statut">
              <NativeSelect testid="rec-status-select" value={f.status} onChange={(v) => set({ status: v as RecurrenceStatus })} options={(Object.keys(STATUS) as RecurrenceStatus[]).map((k) => ({ value: k, label: STATUS[k].label }))} />
            </Field>
          )}
          <Field label="Note (facultative)" className="col-span-2">
            <Textarea data-testid="rec-note-input" rows={2} value={f.note ?? ""} onChange={(e) => set({ note: e.target.value })} className="rounded-xl" />
          </Field>
        </div>
        <DialogFooter className="-mx-6 -mb-6 rounded-b-3xl px-6">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button data-testid="rec-save-button" onClick={submit}>
            {rec ? "Enregistrer" : "Créer la récurrence"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Recurrences() {
  const data = useData();
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<{ open: boolean; rec: Recurrence | null }>({ open: false, rec: null });
  const [toDelete, setToDelete] = useState<Recurrence | null>(null);
  const [toStop, setToStop] = useState<Recurrence | null>(null);
  const accName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? "—";

  useEffect(() => {
    const id = params.get("edit");
    if (id) {
      const r = data.recurrences.find((x) => x.id === id);
      if (r) setDialog({ open: true, rec: r });
      setParams({}, { replace: true });
    }
  }, [params, data.recurrences, setParams]);

  const today = todayIso();
  const end = `${today.slice(0, 4)}-12-31`;
  const plannedYear = data.recurrences.flatMap((r) => forecast(r, today, end));
  const plannedOut = round2(plannedYear.filter((o) => o.amount < 0).reduce((s, o) => s - o.amount, 0));
  const plannedIn = round2(plannedYear.filter((o) => o.amount > 0).reduce((s, o) => s + o.amount, 0));
  const monthlyCost = round2(
    data.recurrences
      .filter((r) => r.status === "active" && r.type === "expense")
      .reduce((s, r) => {
        const factor = { daily: 30.4, weekly: 4.33, monthly: 1, yearly: 1 / 12, custom: r.intervalUnit === "days" ? 30.4 / r.interval : r.intervalUnit === "weeks" ? 4.33 / r.interval : 1 / r.interval }[r.frequency];
        return s + r.amount * factor;
      }, 0),
  );

  const toggle = (r: Recurrence) => {
    saveRecurrence({ ...r, status: r.status === "active" ? "paused" : "active" });
    toast.success(r.status === "active" ? "Récurrence mise en pause" : "Récurrence réactivée");
  };

  return (
    <div>
      <PageHeader
        eyebrow="Anticiper"
        title="Récurrences"
        subtitle="Abonnements, prélèvements, salaires… Les échéances passées sont créées automatiquement et les prochaines sont intégrées au prévisionnel."
        actions={
          <Button data-testid="new-recurrence-button" onClick={() => setDialog({ open: true, rec: null })} className="h-10 rounded-xl">
            <Plus /> Nouvelle récurrence
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard testid="rec-monthly-cost-card" tone="expense" label="Coût mensuel estimé" value={money(monthlyCost)} sub="Dépenses récurrentes actives" />
        <StatCard testid="rec-planned-out-card" tone="plain" label={`Dépenses prévues d'ici fin ${today.slice(0, 4)}`} value={money(plannedOut)} sub={`${plannedYear.filter((o) => o.amount < 0).length} échéances`} />
        <StatCard testid="rec-planned-in-card" tone="income" label={`Revenus prévus d'ici fin ${today.slice(0, 4)}`} value={money(plannedIn)} sub={`${plannedYear.filter((o) => o.amount > 0).length} échéances`} />
      </div>

      <Panel className="mt-5 overflow-hidden p-0 sm:p-0" testid="recurrences-panel">
        {data.recurrences.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={<Repeat className="size-5" />} title="Aucune récurrence" text="Ajoutez vos abonnements et revenus réguliers pour anticiper votre budget." action={<Button onClick={() => setDialog({ open: true, rec: null })}>Créer une récurrence</Button>} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Nom</th>
                  <th className="px-3 py-3">Compte</th>
                  <th className="px-3 py-3">Fréquence</th>
                  <th className="px-3 py-3">Prochaine échéance</th>
                  <th className="px-3 py-3">Fin</th>
                  <th className="px-3 py-3 text-right">Montant</th>
                  <th className="px-3 py-3">Statut</th>
                  <th className="w-12 px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.recurrences.map((r) => (
                  <tr key={r.id} data-testid="recurrence-row" className="border-b border-slate-50 transition-colors hover:bg-slate-50/70">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-800">{r.name}</p>
                      <p className="text-xs text-slate-500">{r.category}{r.note ? ` · ${r.note}` : ""}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{accName(r.accountId)}</td>
                    <td className="px-3 py-3 text-slate-600">{frequencyLabel(r)}</td>
                    <td className="px-3 py-3">
                      {r.status === "ended" ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-slate-700">
                          <CalendarClock className="size-3.5 text-slate-400" /> {fmtDate(r.nextDate)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">{endLabel(r)}</td>
                    <td className="px-3 py-3 text-right">
                      <Amount value={r.type === "income" ? r.amount : -r.amount} />
                    </td>
                    <td className="px-3 py-3">
                      <Chip testid="recurrence-status" className={STATUS[r.status].cls}>
                        {STATUS[r.status].label}
                      </Chip>
                    </td>
                    <td className="px-3 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" data-testid="recurrence-actions-button" aria-label="Actions" />}>
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem data-testid="recurrence-edit" onClick={() => setDialog({ open: true, rec: r })}>
                            <Pencil /> Modifier
                          </DropdownMenuItem>
                          {r.status !== "ended" && (
                            <DropdownMenuItem data-testid="recurrence-toggle" onClick={() => toggle(r)}>
                              {r.status === "active" ? <Pause /> : <Play />} {r.status === "active" ? "Mettre en pause" : "Réactiver"}
                            </DropdownMenuItem>
                          )}
                          {r.status !== "ended" && (
                            <DropdownMenuItem data-testid="recurrence-stop" onClick={() => setToStop(r)}>
                              <Square /> Arrêter
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" data-testid="recurrence-delete" onClick={() => setToDelete(r)}>
                            <Trash2 /> Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <RecurrenceDialog open={dialog.open} rec={dialog.rec} onClose={() => setDialog({ open: false, rec: null })} />
      <ConfirmDialog
        open={!!toStop}
        onOpenChange={(o) => !o && setToStop(null)}
        title="Arrêter cette récurrence ?"
        description={`« ${toStop?.name} » sera marquée terminée et ne générera plus d'opérations.`}
        confirmLabel="Arrêter"
        onConfirm={() => {
          if (toStop) saveRecurrence({ ...toStop, status: "ended" });
          toast.success("Récurrence arrêtée");
        }}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Supprimer cette récurrence ?"
        description={`« ${toDelete?.name} » sera supprimée. Les opérations déjà générées sont conservées.`}
        onConfirm={() => {
          if (toDelete) deleteRecurrence(toDelete.id);
          toast.success("Récurrence supprimée");
        }}
      />
    </div>
  );
}
