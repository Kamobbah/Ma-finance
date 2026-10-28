import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, NativeSelect, inputCls } from "@/components/kit";
import { closeTxDialog, accountOptions, categoryOptions, useTxDialog } from "@/lib/ui";
import { saveTransaction, useData, addTransactions, getData, addTag } from "@/lib/store";
import { AttachmentEditor, TagEditor } from "@/components/TxExtras";
import { budgetLabel, budgetStatuses } from "@/lib/budgets";
import { MAIN_ID } from "@/lib/revolut";
import { parseAmount } from "@/lib/csv";
import { money, todayIso, TYPE_LABELS, uid } from "@/lib/format";
import { INTERNAL_CATEGORY } from "@/lib/rules";
import { ApiError, apiPost } from "@/lib/api";
import { Camera } from "lucide-react";
import type { Attachment, Transaction, TxType } from "@/lib/types";
import { cn } from "@/lib/utils";

const AUTO = "__auto__";

/** Réduit la photo (≤ 1600 px, JPEG) : limite de taille de l'API et formats type HEIC convertis par le navigateur. */
async function photoToJpeg(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85).split(",")[1];
}

function autoType(amount: number, internal: boolean): TxType {
  if (internal) return amount >= 0 ? "transfer_in" : "transfer_out";
  return amount >= 0 ? "income" : "expense";
}

export default function TransactionDialog() {
  const { open, tx } = useTxDialog();
  const data = useData();
  const navigate = useNavigate();
  const editing = !!tx && data.transactions.some((t) => t.id === tx.id);

  const [date, setDate] = useState(todayIso());
  const [accountId, setAccountId] = useState(MAIN_ID);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(AUTO);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [type, setType] = useState<TxType>("expense");
  const [typeTouched, setTypeTouched] = useState(false);
  const [note, setNote] = useState("");
  const [internal, setInternal] = useState(false);
  const [counterpart, setCounterpart] = useState("");
  const [mirror, setMirror] = useState(true);
  const [reading, setReading] = useState(false);

  const readReceipt = async (file?: File) => {
    if (!file) return;
    setReading(true);
    try {
      const r = await apiPost<{ amount: number | null; date: string | null; merchant: string | null }>("/receipt", { image: await photoToJpeg(file), media_type: "image/jpeg" });
      if (r.amount) setAmount(String(-Math.abs(r.amount)).replace(".", ","));
      if (r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) setDate(r.date);
      if (r.merchant && !description.trim()) setDescription(r.merchant);
      if (r.amount && r.date) toast.success("Ticket lu", { description: "Vérifie le montant et la date avant d'enregistrer." });
      else toast.warning("Ticket partiellement lisible", { description: "Complète les champs manquants." });
    } catch (e) {
      const detail = e instanceof ApiError ? (e.body as { detail?: unknown } | null)?.detail : undefined;
      toast.error("Lecture du ticket impossible", { description: typeof detail === "string" ? detail : "Réessaie avec une photo plus nette." });
    } finally {
      setReading(false);
    }
  };
  const [tags, setTags] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  useEffect(() => {
    if (!open) return;
    const firstAcc = data.accounts.find((a) => a.type === "main")?.id ?? data.accounts[0]?.id ?? "";
    setDate(tx?.date ?? todayIso());
    setAccountId(tx?.accountId ?? firstAcc);
    setDescription(tx?.description ?? "");
    setCategory(tx ? (tx.catStatus === "to_review" ? AUTO : tx.category) : AUTO);
    setAmount(tx ? String(tx.amount).replace(".", ",") : "");
    setCurrency(tx?.currency ?? "EUR");
    setType(tx?.type ?? "expense");
    setTypeTouched(!!tx);
    setNote(tx?.note ?? "");
    setInternal(tx?.internal ?? false);
    setCounterpart(tx?.counterpartAccountId ?? "");
    setMirror(!tx);
    setTags(tx?.tags ?? []);
    setAttachments(tx?.attachments ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tx]);

  const amt = parseAmount(amount);
  const effectiveType = typeTouched ? type : autoType(amt ?? -1, internal);

  const submit = () => {
    if (!description.trim()) return toast.error("Ajoutez une description.");
    if (amt === null || amt === 0) return toast.error("Indiquez un montant valide (négatif pour une sortie).");
    if (!accountId) return toast.error("Choisissez un compte.");
    const isAuto = category === AUTO;
    const base: Transaction = {
      ...(editing ? tx! : {}),
      tags: tags.length ? tags : undefined,
      attachments: attachments.length ? attachments : undefined,
      id: editing ? tx!.id : uid(),
      date,
      accountId,
      description: description.trim(),
      category: isAuto ? "" : category,
      type: effectiveType,
      amount: amt,
      currency,
      note: note.trim() || undefined,
      internal: internal || effectiveType === "transfer_in" || effectiveType === "transfer_out",
      counterpartAccountId: internal && counterpart ? counterpart : undefined,
      source: editing ? tx!.source : "manual",
      catStatus: isAuto ? "to_review" : "manual",
      recurrenceId: editing ? tx!.recurrenceId : undefined,
      createdAt: editing ? tx!.createdAt : new Date().toISOString(),
    };
    if (base.internal && isAuto) {
      base.category = INTERNAL_CATEGORY;
      base.catStatus = "auto";
    }
    tags.forEach(addTag);
    saveTransaction(base, isAuto && !base.internal);
    if (!editing && base.internal && counterpart && mirror) {
      const accName = data.accounts.find((a) => a.id === accountId)?.name ?? "";
      addTransactions(
        [
          {
            ...base,
            id: uid(),
            accountId: counterpart,
            amount: -amt,
            type: amt > 0 ? "transfer_out" : "transfer_in",
            counterpartAccountId: accountId,
            description: `${base.description} (${amt > 0 ? "vers" : "depuis"} ${accName})`,
          },
        ],
        false,
      );
    }
    closeTxDialog();
    const saved = getData().transactions.find((t) => t.id === base.id);
    if (saved && saved.amount < 0 && !saved.internal) {
      const d = getData();
      const st = budgetStatuses(d, saved.date.slice(0, 7))
        .filter((x) => (!x.budget.accountId || x.budget.accountId === saved.accountId) && (!x.budget.category || x.budget.category === saved.category) && x.level !== "ok")
        .sort((a, b) => b.ratio - a.ratio)[0];
      if (st) {
        const msg = `Budget « ${budgetLabel(d, st.budget)} » : ${Math.round(st.ratio * 100)} % (${money(st.spent)} / ${money(st.limit)})`;
        if (st.level === "over") toast.error("Budget dépassé", { description: msg, duration: 7000 });
        else toast.warning("Budget bientôt atteint", { description: msg, duration: 7000 });
      }
    }
    const corrected = editing && !isAuto && tx!.category !== category;
    if (corrected) {
      toast.success("Catégorie corrigée", {
        description: `Créer une règle pour classer automatiquement « ${base.description} » ?`,
        action: { label: "Créer une règle", onClick: () => navigate(`/regles?desc=${encodeURIComponent(base.description)}&cat=${encodeURIComponent(category)}&dir=${amt > 0 ? "in" : "out"}`) },
        duration: 8000,
      });
    } else toast.success(editing ? "Opération modifiée" : "Opération ajoutée");
  };

  const accOpts = accountOptions(data.accounts);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeTxDialog()}>
      <DialogContent data-testid="transaction-dialog" className="max-h-[92vh] overflow-y-auto rounded-3xl p-6 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{editing ? "Modifier l'opération" : "Nouvelle opération"}</DialogTitle>
          <DialogDescription>Montant négatif pour une sortie, positif pour une entrée. Le type est déduit automatiquement.</DialogDescription>
        </DialogHeader>
        <label data-testid="tx-receipt-button" className={cn("flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 p-3 text-sm font-semibold text-slate-700 hover:bg-slate-50", reading && "pointer-events-none opacity-60")}>
          <Camera className="size-4" /> {reading ? "Lecture du ticket…" : "Photographier un ticket pour remplir le montant et la date"}
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { readReceipt(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date">
            <Input data-testid="tx-date-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Compte ou Pocket">
            <NativeSelect
              testid="tx-account-select"
              value={accountId}
              onChange={(v) => {
                setAccountId(v);
                setCurrency(data.accounts.find((a) => a.id === v)?.currency ?? "EUR");
              }}
              options={accOpts}
            />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Input data-testid="tx-description-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ex. ALDI Bègles" className={inputCls} />
          </Field>
          <Field label="Montant">
            <Input data-testid="tx-amount-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="-25,90" className={inputCls + " tabular"} />
          </Field>
          <Field label="Devise">
            <NativeSelect testid="tx-currency-select" value={currency} onChange={setCurrency} options={["EUR", "USD", "JPY", "GBP", "CHF"].map((c) => ({ value: c, label: c }))} />
          </Field>
          <Field label="Catégorie">
            <NativeSelect testid="tx-category-select" value={category} onChange={setCategory} options={[{ value: AUTO, label: "Automatique (règles)" }, ...categoryOptions(data)]} />
          </Field>
          <Field label="Type" hint={typeTouched ? "Modifié manuellement" : "Calculé automatiquement"}>
            <NativeSelect
              testid="tx-type-select"
              value={effectiveType}
              onChange={(v) => {
                setType(v as TxType);
                setTypeTouched(true);
                if (v === "transfer_in" || v === "transfer_out") setInternal(true);
              }}
              options={(Object.keys(TYPE_LABELS) as TxType[]).map((k) => ({ value: k, label: TYPE_LABELS[k] }))}
            />
          </Field>
          <div className="sm:col-span-2 rounded-2xl bg-slate-50 p-4">
            <label className="flex items-center gap-3 text-sm font-medium text-slate-800">
              <Checkbox
                data-testid="tx-internal-checkbox"
                checked={internal}
                onCheckedChange={(c) => {
                  setInternal(!!c);
                  if (!c && (type === "transfer_in" || type === "transfer_out")) setTypeTouched(false);
                }}
              />
              Virement interne (entre mes comptes, Pockets ou épargne)
            </label>
            {internal && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Compte lié">
                  <NativeSelect testid="tx-counterpart-select" value={counterpart} onChange={setCounterpart} options={accOpts.filter((o) => o.value !== accountId)} placeholder="— Aucun —" />
                </Field>
                {!editing && counterpart && (
                  <label className="flex items-center gap-2 self-end pb-2 text-xs text-slate-600">
                    <Checkbox data-testid="tx-mirror-checkbox" checked={mirror} onCheckedChange={(c) => setMirror(!!c)} />
                    Créer l'opération miroir sur le compte lié
                  </label>
                )}
              </div>
            )}
          </div>
          <Field label="Note (facultative)" className="sm:col-span-2">
            <Textarea data-testid="tx-note-input" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="rounded-xl" />
          </Field>
          <Field label="Étiquettes" className="sm:col-span-2">
            <TagEditor value={tags} onChange={setTags} known={data.tags ?? []} />
          </Field>
          <Field label="Pièces jointes" className="sm:col-span-2">
            <AttachmentEditor value={attachments} onChange={setAttachments} />
          </Field>
        </div>
        <DialogFooter className="-mx-6 -mb-6 rounded-b-3xl px-6">
          <Button variant="outline" data-testid="tx-cancel-button" onClick={closeTxDialog}>
            Annuler
          </Button>
          <Button data-testid="tx-save-button" onClick={submit} className="active:scale-[0.98] transition-transform">
            {editing ? "Enregistrer" : "Ajouter l'opération"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
