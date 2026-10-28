import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Copy, FlaskConical, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2, Wand2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Amount, Chip, ConfirmDialog, EmptyState, Field, NativeSelect, PageHeader, Panel, inputCls } from "@/components/kit";
import { deleteRule, duplicateRule, moveRule, reapplyRules, saveRule, useData, addCategory } from "@/lib/store";
import { accountOptions, categoryOptions } from "@/lib/ui";
import { describeCondition, ruleMatches } from "@/lib/rules";
import { fmtDate, TYPE_LABELS, uid } from "@/lib/format";
import type { Rule, RuleCondition, TxType } from "@/lib/types";
import { cn } from "@/lib/utils";

type CondField = RuleCondition["field"];
const FIELD_LABELS: Record<CondField, string> = {
  description: "Description",
  amount: "Montant",
  direction: "Sens du montant",
  type: "Type de transaction",
  account: "Compte / Pocket",
  date: "Période",
  category: "Catégorie actuelle",
};
const TYPE_OPTS = (Object.keys(TYPE_LABELS) as TxType[]).map((k) => ({ value: k, label: TYPE_LABELS[k] }));

function newCondition(field: CondField, firstAccount: string, firstCat: string): RuleCondition {
  const id = uid();
  switch (field) {
    case "description":
      return { id, field, op: "contains", value: "" };
    case "amount":
      return { id, field, op: "gt", value: 0 };
    case "direction":
      return { id, field, value: "out" };
    case "type":
      return { id, field, value: "expense" };
    case "account":
      return { id, field, value: firstAccount };
    case "date":
      return { id, field, from: "", to: "" };
    case "category":
      return { id, field, value: firstCat };
  }
}

function ConditionEditor({ c, onChange, onRemove, idx }: { c: RuleCondition; onChange: (c: RuleCondition) => void; onRemove: () => void; idx: number }) {
  const data = useData();
  const fieldSel = (
    <NativeSelect
      testid={`cond-field-${idx}`}
      value={c.field}
      onChange={(v) => onChange(newCondition(v as CondField, data.accounts[0]?.id ?? "", data.categories[0]?.name ?? ""))}
      options={(Object.keys(FIELD_LABELS) as CondField[]).map((k) => ({ value: k, label: FIELD_LABELS[k] }))}
      className="w-full sm:w-44"
    />
  );
  let body: ReactNode = null;
  switch (c.field) {
    case "description":
      body = (
        <>
          <NativeSelect
            testid={`cond-op-${idx}`}
            value={c.op}
            onChange={(v) => onChange({ ...c, op: v as typeof c.op })}
            options={[
              { value: "contains", label: "contient" },
              { value: "startsWith", label: "commence par" },
              { value: "endsWith", label: "se termine par" },
              { value: "equals", label: "est exactement" },
              { value: "regex", label: "expression régulière" },
            ]}
          />
          <Input data-testid={`cond-value-${idx}`} value={c.value} onChange={(e) => onChange({ ...c, value: e.target.value })} placeholder={c.op === "regex" ? "ex. aldi|lidl" : "texte"} className={inputCls + " flex-1 min-w-32"} />
        </>
      );
      break;
    case "amount":
      body = (
        <>
          <NativeSelect testid={`cond-op-${idx}`} value={c.op} onChange={(v) => onChange({ ...c, op: v as typeof c.op })} options={[{ value: "eq", label: "égal à" }, { value: "gt", label: "supérieur à" }, { value: "lt", label: "inférieur à" }, { value: "between", label: "compris entre" }]} />
          <Input data-testid={`cond-value-${idx}`} type="number" step="0.01" value={c.value} onChange={(e) => onChange({ ...c, value: Number(e.target.value) })} className={inputCls + " w-28"} />
          {c.op === "between" && <Input data-testid={`cond-value2-${idx}`} type="number" step="0.01" value={c.value2 ?? ""} onChange={(e) => onChange({ ...c, value2: Number(e.target.value) })} className={inputCls + " w-28"} />}
          <span className="text-xs text-slate-400">€ (valeur absolue)</span>
        </>
      );
      break;
    case "direction":
      body = <NativeSelect testid={`cond-value-${idx}`} value={c.value} onChange={(v) => onChange({ ...c, value: v as "in" | "out" })} options={[{ value: "in", label: "Entrant" }, { value: "out", label: "Sortant" }]} />;
      break;
    case "type":
      body = <NativeSelect testid={`cond-value-${idx}`} value={c.value} onChange={(v) => onChange({ ...c, value: v as TxType })} options={TYPE_OPTS} />;
      break;
    case "account":
      body = <NativeSelect testid={`cond-value-${idx}`} value={c.value} onChange={(v) => onChange({ ...c, value: v })} options={accountOptions(data.accounts, false, true)} />;
      break;
    case "date":
      body = (
        <>
          <Input data-testid={`cond-from-${idx}`} type="date" value={c.from ?? ""} onChange={(e) => onChange({ ...c, from: e.target.value })} className={inputCls} />
          <span className="text-xs text-slate-400">au</span>
          <Input data-testid={`cond-to-${idx}`} type="date" value={c.to ?? ""} onChange={(e) => onChange({ ...c, to: e.target.value })} className={inputCls} />
        </>
      );
      break;
    case "category":
      body = <NativeSelect testid={`cond-value-${idx}`} value={c.value} onChange={(v) => onChange({ ...c, value: v })} options={categoryOptions(data)} />;
      break;
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 p-2.5" data-testid={`condition-${idx}`}>
      {idx > 0 && <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white">ET</span>}
      {fieldSel}
      {body}
      <Button variant="ghost" size="icon-sm" aria-label="Retirer la condition" data-testid={`cond-remove-${idx}`} onClick={onRemove} className="ml-auto">
        <X />
      </Button>
    </div>
  );
}

function RuleDialog({ open, rule, onClose }: { open: boolean; rule: Rule | null; onClose: () => void }) {
  const data = useData();
  const [r, setR] = useState<Rule | null>(null);
  const [newCat, setNewCat] = useState("");
  useEffect(() => {
    if (open) {
      setR(rule ? { ...rule, conditions: rule.conditions.map((c) => ({ ...c })) } : { id: uid(), name: "", enabled: true, conditions: [newCondition("description", "", "")], category: data.categories[0]?.name ?? "" });
      setNewCat("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rule]);
  const matches = useMemo(() => (r ? data.transactions.filter((t) => ruleMatches(r, t)) : []), [r, data.transactions]);
  if (!r) return null;
  const isNew = !data.rules.some((x) => x.id === r.id);

  const submit = () => {
    if (!r.conditions.length) return toast.error("Ajoutez au moins une condition");
    if (r.conditions.some((c) => c.field === "description" && !c.value.trim())) return toast.error("Complétez le texte de la condition");
    let category = r.category;
    if (newCat.trim()) {
      addCategory({ name: newCat.trim(), color: "#" + Math.floor(Math.random() * 0xaaaaaa + 0x222222).toString(16) });
      category = newCat.trim();
    }
    const name = r.name.trim() || describeCondition(r.conditions[0], () => "") + ` → ${category}`;
    saveRule({ ...r, name, category });
    toast.success(isNew ? "Règle créée (priorité 1)" : "Règle enregistrée", {
      description: "Appliquez les règles aux opérations existantes pour mettre à jour les catégories.",
      action: {
        label: "Appliquer",
        onClick: () => toast.success(`${reapplyRules()} opérations recatégorisées`),
      },
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="rule-dialog" className="max-h-[92vh] overflow-y-auto rounded-3xl p-6 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{isNew ? "Nouvelle règle" : "Modifier la règle"}</DialogTitle>
          <DialogDescription>Toutes les conditions doivent être vraies. La première règle correspondante (par priorité) détermine la catégorie.</DialogDescription>
        </DialogHeader>
        <Field label="Nom de la règle (facultatif)">
          <Input data-testid="rule-name-input" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} className={inputCls} />
        </Field>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600">Conditions</p>
          {r.conditions.map((c, i) => (
            <ConditionEditor key={c.id} idx={i} c={c} onChange={(nc) => setR({ ...r, conditions: r.conditions.map((x) => (x.id === c.id ? nc : x)) })} onRemove={() => setR({ ...r, conditions: r.conditions.filter((x) => x.id !== c.id) })} />
          ))}
          <Button variant="outline" size="sm" data-testid="rule-add-condition" className="rounded-xl" onClick={() => setR({ ...r, conditions: [...r.conditions, newCondition("direction", "", "")] })}>
            <Plus /> Ajouter une condition
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-100 p-3 sm:grid-cols-3">
          <Field label="Alors : catégorie">
            <NativeSelect testid="rule-category-select" value={r.category} onChange={(v) => setR({ ...r, category: v })} options={categoryOptions(data)} className="w-full" />
          </Field>
          <Field label="ou nouvelle catégorie">
            <Input data-testid="rule-new-category-input" value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="ex. Animaux" className={inputCls} />
          </Field>
          <Field label="et type (facultatif)">
            <NativeSelect testid="rule-type-select" value={r.setType ?? ""} onChange={(v) => setR({ ...r, setType: (v || undefined) as TxType | undefined })} options={TYPE_OPTS} placeholder="Ne pas changer" className="w-full" />
          </Field>
        </div>
        <div className="rounded-2xl bg-blue-50/60 p-3" data-testid="rule-live-test">
          <p className="flex items-center gap-2 text-sm font-semibold text-blue-950">
            <FlaskConical className="size-4" /> Test en direct : <span data-testid="rule-live-test-count">{matches.length}</span> opération(s) correspondent
          </p>
          {matches.length > 0 && (
            <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs">
              {matches.slice(0, 8).map((t) => (
                <li key={t.id} className="flex justify-between gap-2 text-slate-600">
                  <span className="truncate">
                    {fmtDate(t.date)} · {t.description}
                  </span>
                  <Amount value={t.amount} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter className="-mx-6 -mb-6 rounded-b-3xl px-6">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button data-testid="rule-save-button" onClick={submit}>
            {isNew ? "Créer la règle" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TestDialog({ rule, onClose }: { rule: Rule | null; onClose: () => void }) {
  const data = useData();
  const matches = rule ? data.transactions.filter((t) => ruleMatches(rule, t)) : [];
  const winning = rule ? matches.filter((t) => data.rules.find((r) => r.enabled && ruleMatches(r, t))?.id === rule.id) : [];
  const changes = winning.filter((t) => t.catStatus !== "manual" && t.category !== rule?.category).length;
  return (
    <Dialog open={!!rule} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="rule-test-dialog" className="max-h-[90vh] overflow-y-auto rounded-3xl p-6 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Tester « {rule?.name} »</DialogTitle>
          <DialogDescription>
            <span data-testid="rule-test-count">{matches.length}</span> opérations correspondent aux conditions · {winning.length} seraient classées par cette règle (priorité) · {changes} changeraient de catégorie.
          </DialogDescription>
        </DialogHeader>
        {matches.length ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {matches.slice(0, 40).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">{t.description}</p>
                  <p className="text-xs text-slate-500">
                    {fmtDate(t.date)} · actuellement : {t.category}
                  </p>
                </div>
                <Amount value={t.amount} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Aucune opération ne correspond" />
        )}
        <DialogFooter className="-mx-6 -mb-6 rounded-b-3xl px-6">
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
          <Button
            data-testid="rule-test-apply"
            onClick={() => {
              toast.success(`${reapplyRules()} opérations recatégorisées`);
              onClose();
            }}
          >
            Appliquer les règles aux opérations
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Rules() {
  const data = useData();
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<{ open: boolean; rule: Rule | null }>({ open: false, rule: null });
  const [testRule, setTestRule] = useState<Rule | null>(null);
  const [toDelete, setToDelete] = useState<Rule | null>(null);
  const accName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? id;
  const toReview = data.transactions.filter((t) => t.catStatus === "to_review").length;

  useEffect(() => {
    const desc = params.get("desc");
    if (desc) {
      const cat = params.get("cat") ?? data.categories[0]?.name ?? "";
      const dir = params.get("dir") === "in" ? "in" : "out";
      setDialog({
        open: true,
        rule: { id: uid(), name: "", enabled: true, conditions: [{ id: uid(), field: "description", op: "contains", value: desc }, { id: uid(), field: "direction", value: dir }], category: cat },
      });
      setParams({}, { replace: true });
    }
  }, [params, setParams, data.categories]);

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of data.transactions) if (t.ruleId) m.set(t.ruleId, (m.get(t.ruleId) ?? 0) + 1);
    return m;
  }, [data.transactions]);

  return (
    <div>
      <PageHeader
        eyebrow="Catégorisation automatique"
        title="Règles"
        subtitle="Les règles sont évaluées dans l'ordre : la première qui correspond attribue la catégorie. Les catégories corrigées à la main ne sont jamais écrasées."
        actions={
          <>
            <Button variant="outline" data-testid="reapply-rules-button" className="h-10 rounded-xl" onClick={() => toast.success(`${reapplyRules()} opérations recatégorisées`)}>
              <RefreshCw /> Réappliquer les règles
            </Button>
            <Button data-testid="new-rule-button" className="h-10 rounded-xl" onClick={() => setDialog({ open: true, rule: null })}>
              <Plus /> Nouvelle règle
            </Button>
          </>
        }
      />
      {toReview > 0 && (
        <div data-testid="rules-to-review-banner" className="mb-5 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 animate-rise">
          <Wand2 className="size-5 shrink-0" />
          <span>
            <b>{toReview}</b> opérations ne correspondent à aucune règle et sont marquées « À vérifier ». Corrigez leur catégorie dans Opérations : on vous proposera de créer une règle.
          </span>
        </div>
      )}
      <Panel className="p-3 sm:p-3" testid="rules-panel">
        {data.rules.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Aucune règle" text="Créez une règle pour catégoriser automatiquement vos opérations." />
          </div>
        ) : (
          <ol className="space-y-2">
            {data.rules.map((r, i) => (
              <li key={r.id} data-testid="rule-row" className={cn("flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 transition-[opacity,background-color] hover:bg-slate-50/70", !r.enabled && "opacity-55")}>
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-slate-900 text-xs font-bold text-white" data-testid="rule-priority">
                  {i + 1}
                </span>
                <div className="flex flex-col">
                  <Button variant="ghost" size="icon-xs" aria-label="Monter" data-testid={`rule-up-${i}`} disabled={i === 0} onClick={() => moveRule(r.id, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon-xs" aria-label="Descendre" data-testid={`rule-down-${i}`} disabled={i === data.rules.length - 1} onClick={() => moveRule(r.id, 1)}>
                    <ArrowDown />
                  </Button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-800" data-testid="rule-name">
                    {r.name}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.conditions.map((c, ci) => (
                      <Chip key={c.id} className="bg-slate-50 text-slate-600 ring-slate-200 font-medium">
                        {ci > 0 && <b className="text-slate-400">ET</b>} {describeCondition(c, accName)}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Chip className="bg-emerald-50 text-emerald-800 ring-emerald-200">→ {r.category}</Chip>
                  {r.setType && <Chip className="bg-blue-50 text-blue-800 ring-blue-200">{TYPE_LABELS[r.setType]}</Chip>}
                  <span className="w-14 text-right text-[11px] text-slate-400 tabular">{usage.get(r.id) ?? 0} op.</span>
                </div>
                <Switch data-testid={`rule-toggle-${i}`} checked={r.enabled} onCheckedChange={(c) => saveRule({ ...r, enabled: !!c })} aria-label="Activer la règle" />
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" data-testid="rule-actions-button" aria-label="Actions" />}>
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem data-testid="rule-test" onClick={() => setTestRule(r)}>
                      <FlaskConical /> Tester
                    </DropdownMenuItem>
                    <DropdownMenuItem data-testid="rule-edit" onClick={() => setDialog({ open: true, rule: r })}>
                      <Pencil /> Modifier
                    </DropdownMenuItem>
                    <DropdownMenuItem data-testid="rule-duplicate" onClick={() => duplicateRule(r.id)}>
                      <Copy /> Dupliquer
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" data-testid="rule-delete" onClick={() => setToDelete(r)}>
                      <Trash2 /> Supprimer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ol>
        )}
      </Panel>
      <RuleDialog open={dialog.open} rule={dialog.rule} onClose={() => setDialog({ open: false, rule: null })} />
      <TestDialog rule={testRule} onClose={() => setTestRule(null)} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Supprimer cette règle ?"
        description={`« ${toDelete?.name} » sera supprimée. Les catégories déjà attribuées restent inchangées jusqu'à la prochaine réapplication.`}
        onConfirm={() => {
          if (toDelete) deleteRule(toDelete.id);
          toast.success("Règle supprimée");
        }}
      />
    </div>
  );
}
