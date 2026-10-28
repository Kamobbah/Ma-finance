import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Database, Download, FileJson, FileUp, Pencil, Plus, RotateCcw, Tag, Trash2, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip, ConfirmDialog, Field, NativeSelect, PageHeader, Panel, PanelTitle, inputCls } from "@/components/kit";
import CsvImportDialog from "@/components/CsvImportDialog";
import { BackupsPanel, GoalsExportButtons, ImportHistoryPanel, TrashPanel } from "@/components/DataExtras";
import { transactionsToCsv } from "./Operations";
import { addCategory, clearAll, deleteAccount, replaceAll, resetToSeed, saveAccount, useData, usePrefs } from "@/lib/store";
import { accountBalance, scopedTx, scopeLabel } from "@/lib/analytics";
import { ACCOUNT_TYPE_LABELS, money, uid } from "@/lib/format";
import { downloadFile, parseAmount } from "@/lib/csv";
import { MAIN_ID } from "@/lib/revolut";
import type { Account, AccountType, AppData } from "@/lib/types";

const COLORS = ["#0F172A", "#F59E0B", "#8B5CF6", "#06B6D4", "#EC4899", "#10B981", "#6366F1", "#F97316", "#D97706", "#64748B"];

function AccountDialog({ open, acc, onClose }: { open: boolean; acc: Account | null; onClose: () => void }) {
  const data = useData();
  const [f, setF] = useState<Account | null>(null);
  const [opening, setOpening] = useState("");
  useEffect(() => {
    if (!open) return;
    const base: Account = acc ?? { id: uid(), name: "", type: "pocket", currency: "EUR", openingBalance: 0, color: COLORS[1], archived: false, parentId: MAIN_ID };
    setF(base);
    setOpening(String(base.openingBalance).replace(".", ","));
  }, [open, acc]);
  if (!f) return null;
  const submit = () => {
    if (!f.name.trim()) return toast.error("Donnez un nom au compte");
    if (f.type === "main" && data.accounts.some((a) => a.type === "main" && a.id !== f.id)) return toast.error("Il existe déjà un compte principal");
    saveAccount({ ...f, name: f.name.trim(), openingBalance: parseAmount(opening) ?? 0, parentId: f.type === "pocket" ? (data.accounts.find((a) => a.type === "main")?.id ?? MAIN_ID) : undefined });
    toast.success(acc ? "Compte modifié" : "Compte créé");
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="account-dialog" className="rounded-3xl p-6 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{acc ? "Modifier le compte" : "Nouveau compte ou Pocket"}</DialogTitle>
          <DialogDescription>Les Pockets sont des sous-comptes du compte principal, avec leurs propres analyses.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nom" className="col-span-2">
            <Input data-testid="account-name-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Type">
            <NativeSelect testid="account-type-select" value={f.type} onChange={(v) => setF({ ...f, type: v as AccountType })} options={(Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map((k) => ({ value: k, label: ACCOUNT_TYPE_LABELS[k] }))} />
          </Field>
          <Field label="Devise">
            <NativeSelect testid="account-currency-select" value={f.currency} onChange={(v) => setF({ ...f, currency: v })} options={["EUR", "USD", "JPY", "GBP", "CHF"].map((c) => ({ value: c, label: c }))} />
          </Field>
          <Field label="Solde d'ouverture (facultatif)">
            <Input data-testid="account-opening-input" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Statut">
            <NativeSelect testid="account-status-select" value={f.archived ? "archived" : "active"} onChange={(v) => setF({ ...f, archived: v === "archived" })} options={[{ value: "active", label: "Actif" }, { value: "archived", label: "Archivé" }]} />
          </Field>
          <div className="col-span-2">
            <p className="mb-1.5 text-xs font-semibold text-slate-600">Couleur</p>
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map((c) => (
                <button key={c} aria-label={`Couleur ${c}`} data-testid={`account-color-${c.slice(1)}`} onClick={() => setF({ ...f, color: c })} className={`size-7 rounded-full transition-transform hover:scale-110 ${f.color === c ? "ring-2 ring-offset-2 ring-slate-900" : ""}`} style={{ background: c }} />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="-mx-6 -mb-6 rounded-b-3xl px-6">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button data-testid="account-save-button" onClick={submit}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DataPage() {
  const data = useData();
  const prefs = usePrefs();
  const [csvOpen, setCsvOpen] = useState(false);
  const [pendingJson, setPendingJson] = useState<AppData | null>(null);
  const [confirmReset, setConfirmReset] = useState<"seed" | "empty" | null>(null);
  const [accDialog, setAccDialog] = useState<{ open: boolean; acc: Account | null }>({ open: false, acc: null });
  const [accDelete, setAccDelete] = useState<Account | null>(null);
  const [catName, setCatName] = useState("");
  const [catColor, setCatColor] = useState("#0EA5E9");
  const stamp = new Date().toISOString().slice(0, 10);
  const accName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? "—";

  const exportJson = () => {
    downloadFile(`ma-finance-sauvegarde-${stamp}.json`, JSON.stringify({ app: "Ma Finance", exportedAt: new Date().toISOString(), ...data }, null, 2), "application/json");
    toast.success("Sauvegarde JSON exportée");
  };
  const filteredTx = scopedTx(data, prefs.accountFilter, `${prefs.year}-01-01`, `${prefs.year}-12-31`).sort((a, b) => a.date.localeCompare(b.date));
  const exportCsv = () => {
    if (!filteredTx.length) return toast.error("Aucune opération pour ce filtre");
    downloadFile(`ma-finance-${prefs.year}-${stamp}.csv`, transactionsToCsv(filteredTx, accName), "text/csv;charset=utf-8");
    toast.success(`${filteredTx.length} opérations exportées`);
  };
  const onJson = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<AppData>;
      if (!Array.isArray(parsed.transactions) || !Array.isArray(parsed.accounts)) throw new Error("format");
      setPendingJson({ version: 1, budgets: parsed.budgets ?? [], dismissedSubscriptions: parsed.dismissedSubscriptions ?? [], accounts: parsed.accounts, transactions: parsed.transactions, categories: parsed.categories ?? data.categories, rules: parsed.rules ?? [], recurrences: parsed.recurrences ?? [], goals: parsed.goals ?? [] });
    } catch {
      toast.error("Fichier JSON invalide : ce n'est pas une sauvegarde Ma Finance");
    }
  };

  const txCount = (id: string) => data.transactions.filter((t) => t.accountId === id).length;

  return (
    <div>
      <PageHeader eyebrow="Vos données, dans votre base MongoDB" title="Données" subtitle="Importez, exportez, sauvegardez et gérez vos comptes. Tout est enregistré dans MongoDB via le serveur de l'application." />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel testid="import-panel">
          <PanelTitle sub="Rien n'est écrasé sans votre confirmation">Importer</PanelTitle>
          <div className="space-y-3">
            <button data-testid="data-import-csv-button" onClick={() => setCsvOpen(true)} className="flex w-full items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-left transition-colors hover:bg-slate-100/70">
              <span className="grid size-11 place-items-center rounded-2xl bg-white text-slate-700 shadow-sm">
                <FileUp className="size-5" />
              </span>
              <span>
                <span className="block font-semibold text-slate-800">Fichier CSV de transactions</span>
                <span className="text-xs text-slate-500">Relevé Revolut ou tout CSV : correspondance des colonnes, aperçu et détection des doublons.</span>
              </span>
            </button>
            <label className="flex w-full cursor-pointer items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 transition-colors hover:bg-slate-100/70">
              <span className="grid size-11 place-items-center rounded-2xl bg-white text-slate-700 shadow-sm">
                <Upload className="size-5" />
              </span>
              <span>
                <span className="block font-semibold text-slate-800">Sauvegarde JSON complète</span>
                <span className="text-xs text-slate-500">Restaure ou transfère toutes vos données (remplace les données actuelles après confirmation).</span>
              </span>
              <input data-testid="json-file-input" type="file" accept=".json,application/json" className="sr-only" onChange={(e) => onJson(e.target.files?.[0])} />
            </label>
          </div>
        </Panel>

        <Panel testid="export-panel">
          <PanelTitle sub="À faire régulièrement pour ne rien perdre">Exporter</PanelTitle>
          <div className="space-y-3">
            <button data-testid="export-json-button" onClick={exportJson} className="flex w-full items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-left transition-colors hover:bg-slate-100/70">
              <span className="grid size-11 place-items-center rounded-2xl bg-slate-900 text-white shadow-sm">
                <FileJson className="size-5" />
              </span>
              <span>
                <span className="block font-semibold text-slate-800">Export JSON de toutes les données</span>
                <span className="text-xs text-slate-500">
                  {data.transactions.length} opérations · {data.accounts.length} comptes · {data.rules.length} règles · {data.recurrences.length} récurrences · {data.goals.length} objectifs
                </span>
              </span>
            </button>
            <button data-testid="data-export-csv-button" onClick={exportCsv} className="flex w-full items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-left transition-colors hover:bg-slate-100/70">
              <span className="grid size-11 place-items-center rounded-2xl bg-white text-slate-700 shadow-sm">
                <Download className="size-5" />
              </span>
              <span>
                <span className="block font-semibold text-slate-800">Export CSV des transactions filtrées</span>
                <span className="text-xs text-slate-500">
                  {scopeLabel(data.accounts, prefs.accountFilter)} · {prefs.year} — {filteredTx.length} opérations (filtre global du tableau de bord). Pour un filtre fin, exportez depuis Opérations.
                </span>
              </span>
            </button>
            <GoalsExportButtons />
          </div>
        </Panel>
      </div>

      <ImportHistoryPanel />
      <div className="grid grid-cols-1 gap-x-5 lg:grid-cols-2">
        <TrashPanel />
        <BackupsPanel />
      </div>

      <Panel className="mt-5 overflow-hidden" testid="accounts-panel">
        <PanelTitle
          sub="Compte principal, Pockets, épargne et autres devises"
          aside={
            <Button size="sm" data-testid="new-account-button" className="rounded-xl" onClick={() => setAccDialog({ open: true, acc: null })}>
              <Plus /> Nouveau compte
            </Button>
          }
        >
          Comptes et Pockets
        </PanelTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="py-2.5 pr-3">Compte</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Devise</th>
                <th className="px-3 py-2.5 text-right">Ouverture</th>
                <th className="px-3 py-2.5 text-right">Solde actuel</th>
                <th className="px-3 py-2.5">Statut</th>
                <th className="py-2.5 pl-3" />
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((a) => (
                <tr key={a.id} data-testid="account-row" className="border-b border-slate-50">
                  <td className="py-3 pr-3 font-medium text-slate-800">
                    <span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: a.color }} />
                    {a.name}
                    <span className="ml-2 text-xs text-slate-400">{txCount(a.id)} op.</span>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{ACCOUNT_TYPE_LABELS[a.type]}</td>
                  <td className="px-3 py-3 text-slate-600">{a.currency}</td>
                  <td className="px-3 py-3 text-right tabular text-slate-500">{money(a.openingBalance, a.currency)}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular">{money(accountBalance(a, data.transactions), a.currency)}</td>
                  <td className="px-3 py-3">{a.archived ? <Chip className="bg-slate-100 text-slate-600 ring-slate-200">Archivé</Chip> : <Chip className="bg-emerald-50 text-emerald-700 ring-emerald-200">Actif</Chip>}</td>
                  <td className="py-3 pl-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label="Modifier" data-testid="account-edit-button" onClick={() => setAccDialog({ open: true, acc: a })}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={a.archived ? "Réactiver" : "Archiver"} data-testid="account-archive-button" onClick={() => saveAccount({ ...a, archived: !a.archived })}>
                        {a.archived ? <ArchiveRestore /> : <Archive />}
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Supprimer" data-testid="account-delete-button" onClick={() => (txCount(a.id) ? toast.error("Ce compte contient des opérations : archivez-le plutôt.") : setAccDelete(a))}>
                        <Trash2 />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel testid="categories-panel">
          <PanelTitle sub={`${data.categories.length} catégories`}>Catégories</PanelTitle>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {data.categories.map((c) => (
              <Chip key={c.name} className="bg-white text-slate-700 ring-slate-200">
                <span className="size-2 rounded-full" style={{ background: c.color }} />
                {c.name}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Nouvelle catégorie" className="flex-1">
              <Input data-testid="new-category-input" value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="ex. Animaux" className={inputCls} />
            </Field>
            <input type="color" aria-label="Couleur" data-testid="new-category-color" value={catColor} onChange={(e) => setCatColor(e.target.value)} className="h-10 w-12 cursor-pointer rounded-xl border border-slate-200 bg-white p-1" />
            <Button
              data-testid="add-category-button"
              className="h-10 rounded-xl"
              onClick={() => {
                if (!catName.trim()) return;
                addCategory({ name: catName.trim(), color: catColor });
                setCatName("");
                toast.success("Catégorie ajoutée");
              }}
            >
              <Tag /> Ajouter
            </Button>
          </div>
        </Panel>

        <Panel testid="reset-panel" className="border-rose-100">
          <PanelTitle sub="Action irréversible — exportez une sauvegarde avant">Réinitialisation</PanelTitle>
          <div className="space-y-3">
            <Button variant="outline" data-testid="reset-seed-button" className="h-auto w-full justify-start gap-3 rounded-2xl p-4 text-left" onClick={() => setConfirmReset("seed")}>
              <RotateCcw className="size-5 text-amber-600" />
              <span>
                <span className="block font-semibold">Revenir au relevé Revolut complet</span>
                <span className="block text-xs font-normal text-slate-500 whitespace-normal">Efface vos ajouts et réimporte le relevé Revolut complet (depuis 2019).</span>
              </span>
            </Button>
            <Button variant="outline" data-testid="reset-empty-button" className="h-auto w-full justify-start gap-3 rounded-2xl border-rose-200 p-4 text-left hover:bg-rose-50" onClick={() => setConfirmReset("empty")}>
              <Database className="size-5 text-rose-600" />
              <span>
                <span className="block font-semibold text-rose-700">Tout effacer</span>
                <span className="block text-xs font-normal text-slate-500 whitespace-normal">Supprime comptes, opérations, objectifs et récurrences de la base.</span>
              </span>
            </Button>
          </div>
        </Panel>
      </div>

      <CsvImportDialog open={csvOpen} onOpenChange={setCsvOpen} />
      <AccountDialog open={accDialog.open} acc={accDialog.acc} onClose={() => setAccDialog({ open: false, acc: null })} />
      <ConfirmDialog
        open={!!pendingJson}
        onOpenChange={(o) => !o && setPendingJson(null)}
        testid="json-confirm-dialog"
        title="Remplacer toutes les données ?"
        description={pendingJson ? `La sauvegarde contient ${pendingJson.transactions.length} opérations et ${pendingJson.accounts.length} comptes. Vos données actuelles (${data.transactions.length} opérations) seront remplacées.` : ""}
        confirmLabel="Remplacer"
        onConfirm={() => {
          if (pendingJson) replaceAll(pendingJson);
          toast.success("Sauvegarde restaurée");
        }}
      />
      <ConfirmDialog
        open={!!confirmReset}
        onOpenChange={(o) => !o && setConfirmReset(null)}
        testid="reset-confirm-dialog"
        title={confirmReset === "seed" ? "Revenir au relevé initial ?" : "Tout effacer ?"}
        description="Cette action est définitive. Pensez à exporter une sauvegarde JSON avant de continuer."
        requireText="RÉINITIALISER"
        confirmLabel="Réinitialiser"
        onConfirm={() => {
          if (confirmReset === "seed") resetToSeed();
          else clearAll();
          toast.success("Données réinitialisées");
        }}
      />
      <ConfirmDialog
        open={!!accDelete}
        onOpenChange={(o) => !o && setAccDelete(null)}
        title="Supprimer ce compte ?"
        description={`« ${accDelete?.name} » sera supprimé.`}
        onConfirm={() => {
          if (accDelete) deleteAccount(accDelete.id);
          toast.success("Compte supprimé");
        }}
      />
    </div>
  );
}
