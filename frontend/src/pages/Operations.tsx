import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Copy, Download, FileUp, MoreHorizontal, Pencil, Plus, Search, Trash2, X, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { toastUndo } from "@/lib/undo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Amount, CatStatusBadge, ConfirmDialog, EmptyState, Field, NativeSelect, PageHeader, Panel, SourceBadge, TypeBadge, inputCls } from "@/components/kit";
import CsvImportDialog from "@/components/CsvImportDialog";
import { deleteFilter, deleteTransaction, duplicateTransaction, saveFilter, setCategoryMany, usePrefs, useData } from "@/lib/store";
import { isRecurringTx, LOW_CONFIDENCE, suggestCategory } from "@/lib/smart";
import type { SavedFilter } from "@/lib/types";
import { Bookmark, Paperclip, Repeat, Sparkles } from "lucide-react";
import { accountOptions, categoryOptions, openTxDialog, yearOptions } from "@/lib/ui";
import { fmtDate, money, MONTHS_LONG, TYPE_LABELS } from "@/lib/format";
import { downloadFile, parseAmount, toCsv } from "@/lib/csv";
import { scopeIds } from "@/lib/analytics";
import type { Transaction, TxType } from "@/lib/types";

const PAGE = 60;

export function transactionsToCsv(txs: Transaction[], accName: (id: string) => string) {
  return toCsv([
    ["Date", "Compte", "Description", "Catégorie", "Type", "Montant", "Devise", "Virement interne", "Source", "Statut catégorie", "Note"],
    ...txs.map((t) => [t.date, accName(t.accountId), t.description, t.category, TYPE_LABELS[t.type], String(t.amount).replace(".", ","), t.currency, t.internal ? "oui" : "non", t.source, t.catStatus, t.note ?? ""]),
  ]);
}

export default function Operations() {
  const data = useData();
  const prefs = usePrefs();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [tag, setTag] = useState(params.get("tag") ?? "");
  const [kind, setKind] = useState("");
  useEffect(() => {
    const pq = params.get("q");
    if (pq !== null) {
      setQ(pq);
      setYear("");
    }
  }, [params]);
  const [naming, setNaming] = useState<string | null>(null);
  const [year, setYear] = useState(String(prefs.year));
  const [month, setMonth] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [account, setAccount] = useState(params.get("account") ?? prefs.accountFilter);
  const [category, setCategory] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [toDelete, setToDelete] = useState<Transaction | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const accName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    const ids = scopeIds(data.accounts, account);
    const needle = q.trim().toLowerCase();
    const minV = parseAmount(min);
    const maxV = parseAmount(max);
    const needleNum = parseAmount(needle);
    return data.transactions
      .filter((t) => {
        if (!ids.has(t.accountId)) return false;
        if (year && !from && !to && !t.date.startsWith(year)) return false;
        if (month && !from && !to && Number(t.date.slice(5, 7)) !== Number(month)) return false;
        if (from && t.date < from) return false;
        if (to && t.date > to) return false;
        if (category && t.category !== category) return false;
        if (type && t.type !== type) return false;
        if (tag && !(t.tags ?? []).includes(tag)) return false;
        if (kind === "recurring" && !isRecurringTx(data, t)) return false;
        if (kind === "oneoff" && (t.amount >= 0 || t.internal || isRecurringTx(data, t))) return false;
        if (status && t.catStatus !== status && t.source !== status) return false;
        const a = Math.abs(t.amount);
        if (minV !== null && a < minV) return false;
        if (maxV !== null && a > maxV) return false;
        if (needle) {
          const hay = `${t.description} ${t.category} ${accName(t.accountId)} ${t.note ?? ""} ${(t.tags ?? []).map((x) => `#${x}`).join(" ")} ${(t.attachments ?? []).map((a) => a.name).join(" ")}`.toLowerCase();
          const amountHit = needleNum !== null && Math.abs(a - Math.abs(needleNum)) < 0.005;
          if (!hay.includes(needle) && !amountHit && !String(a).includes(needle.replace(",", "."))) return false;
        }
        return true;
      })
      .sort((x, y) => y.date.localeCompare(x.date) || y.createdAt.localeCompare(x.createdAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, q, year, month, from, to, account, category, type, status, min, max, tag, kind]);

  const totals = filtered.reduce((s, t) => ({ inc: s.inc + (t.amount > 0 ? t.amount : 0), out: s.out + (t.amount < 0 ? -t.amount : 0) }), { inc: 0, out: 0 });
  const toReview = filtered.filter((t) => t.catStatus === "to_review").length;

  const reset = () => {
    setQ("");
    setYear(String(prefs.year));
    setMonth("");
    setFrom("");
    setTo("");
    setAccount("all");
    setCategory("");
    setType("");
    setStatus("");
    setMin("");
    setMax("");
    setTag("");
    setKind("");
  };
  const curYear = String(new Date().getFullYear());
  const carCat = data.categories.find((c) => /voiture/i.test(c.name))?.name;
  const builtIn: SavedFilter[] = [
    ...(carCat ? [{ id: "bi-car", name: `Dépenses voiture ${curYear}`, query: "", category: carCat, year: curYear }] : []),
    { id: "bi-subs", name: "Abonnements et charges récurrentes", query: "", kind: "recurring", year: "" },
    { id: "bi-review", name: "Non classées / à vérifier", query: "", kind: "review", year: "" },
    { id: "bi-refund", name: "#remboursable", query: "", tag: "remboursable", year: "" },
  ];
  const applyFilter = (f: SavedFilter) => {
    reset();
    setQ(f.query);
    setYear(f.year ?? "");
    setAccount(f.account ?? "all");
    setCategory(f.category ?? "");
    setTag(f.tag ?? "");
    if (f.kind === "review") setStatus("to_review");
    else setKind(f.kind ?? "");
  };
  const saveCurrent = () => {
    if (!naming?.trim()) return toast.error("Donnez un nom au filtre");
    saveFilter({ id: crypto.randomUUID(), name: naming.trim(), query: q, year, account, category, tag, kind: status === "to_review" ? "review" : kind });
    setNaming(null);
    toast.success("Filtre enregistré");
  };
  const applySuggestion = (t: Transaction, cat: string, ids: string[]) => {
    const all = [...new Set([t.id, ...ids])];
    setCategoryMany(all, cat);
    toastUndo(`« ${cat} » appliquée à ${all.length} opération${all.length > 1 ? "s" : ""}`);
  };

  const exportCsv = () => {
    if (!filtered.length) return toast.error("Aucune opération à exporter");
    downloadFile(`ma-finance-operations-${new Date().toISOString().slice(0, 10)}.csv`, transactionsToCsv(filtered, accName), "text/csv;charset=utf-8");
    toast.success(`${filtered.length} opérations exportées`);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Toutes vos transactions"
        title="Opérations"
        subtitle="Recherchez, filtrez, corrigez et ajoutez vos opérations. Chaque modification est sauvegardée automatiquement dans la base."
        actions={
          <>
            <Button variant="outline" data-testid="import-csv-button" onClick={() => setImportOpen(true)} className="h-10 rounded-xl">
              <FileUp /> Importer CSV
            </Button>
            <Button variant="outline" data-testid="export-csv-button" onClick={exportCsv} className="h-10 rounded-xl">
              <Download /> Exporter la sélection
            </Button>
            <Button data-testid="operations-add-button" onClick={() => openTxDialog()} className="h-10 rounded-xl">
              <Plus /> Ajouter
            </Button>
          </>
        }
      />

      <Panel className="mb-5" testid="operations-filters">
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input data-testid="operations-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher par description, catégorie, compte ou montant…" className="h-11 rounded-2xl border-slate-200 bg-slate-50 pl-10" />
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-1.5" data-testid="saved-filters">
          <Bookmark className="size-4 text-slate-400" />
          {[...builtIn, ...(data.savedFilters ?? [])].map((f) => (
            <span key={f.id} className="inline-flex items-center rounded-full bg-white ring-1 ring-slate-200 transition-colors hover:bg-slate-50">
              <button data-testid={`saved-filter-${f.id}`} onClick={() => applyFilter(f)} className="px-3 py-1 text-xs font-semibold text-slate-700">
                {f.name}
              </button>
              {!f.id.startsWith("bi-") && (
                <button aria-label="Supprimer le filtre" data-testid="saved-filter-delete" onClick={() => deleteFilter(f.id)} className="pr-2 text-slate-400 hover:text-rose-600">
                  <X className="size-3" />
                </button>
              )}
            </span>
          ))}
          {naming === null ? (
            <button data-testid="save-filter-button" onClick={() => setNaming("")} className="rounded-full px-3 py-1 text-xs font-medium text-slate-500 ring-1 ring-dashed ring-slate-300 hover:text-slate-900">
              + Enregistrer ce filtre
            </button>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Input data-testid="save-filter-name" autoFocus value={naming} onChange={(e) => setNaming(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveCurrent()} placeholder="Nom du filtre" className="h-8 w-44 rounded-full text-xs" />
              <Button size="sm" className="h-8 rounded-full" data-testid="save-filter-confirm" onClick={saveCurrent}>
                OK
              </Button>
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <Field label="Année">
            <NativeSelect testid="ops-year-select" value={year} onChange={setYear} options={yearOptions(data)} placeholder="Toutes" />
          </Field>
          <Field label="Mois">
            <NativeSelect testid="ops-month-select" value={month} onChange={setMonth} options={MONTHS_LONG.map((m, i) => ({ value: String(i + 1), label: m }))} placeholder="Tous" />
          </Field>
          <Field label="Du">
            <Input data-testid="ops-from-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Au">
            <Input data-testid="ops-to-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Compte ou Pocket">
            <NativeSelect testid="ops-account-select" value={account} onChange={setAccount} options={accountOptions(data.accounts, true, true)} />
          </Field>
          <Field label="Catégorie">
            <NativeSelect testid="ops-category-select" value={category} onChange={setCategory} options={categoryOptions(data)} placeholder="Toutes" />
          </Field>
          <Field label="Type">
            <NativeSelect testid="ops-type-select" value={type} onChange={setType} options={(Object.keys(TYPE_LABELS) as TxType[]).map((k) => ({ value: k, label: TYPE_LABELS[k] }))} placeholder="Tous" />
          </Field>
          <Field label="Statut / origine">
            <NativeSelect
              testid="ops-status-select"
              value={status}
              onChange={setStatus}
              options={[
                { value: "to_review", label: "À vérifier" },
                { value: "auto", label: "Catégorie automatique" },
                { value: "manual", label: "Catégorie manuelle / saisie manuelle" },
                { value: "import", label: "Importée" },
                { value: "recurring", label: "Générée par récurrence" },
              ]}
              placeholder="Tous"
            />
          </Field>
          <Field label="Étiquette">
            <NativeSelect testid="ops-tag-select" value={tag} onChange={setTag} options={[...new Set([...(data.tags ?? []), ...data.transactions.flatMap((t) => t.tags ?? [])])].sort().map((t) => ({ value: t, label: `#${t}` }))} placeholder="Toutes" />
          </Field>
          <Field label="Nature">
            <NativeSelect testid="ops-kind-select" value={kind} onChange={setKind} options={[{ value: "recurring", label: "Dépenses récurrentes" }, { value: "oneoff", label: "Dépenses ponctuelles" }]} placeholder="Toutes" />
          </Field>
          <Field label="Montant min.">
            <Input data-testid="ops-min-input" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} placeholder="0" className={inputCls} />
          </Field>
          <Field label="Montant max.">
            <Input data-testid="ops-max-input" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} placeholder="∞" className={inputCls} />
          </Field>
          <div className="col-span-2 flex items-end">
            <Button variant="ghost" data-testid="ops-reset-filters" onClick={reset} className="h-10 rounded-xl text-slate-600">
              <X /> Réinitialiser les filtres
            </Button>
          </div>
        </div>
      </Panel>

      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 px-1 text-sm text-slate-600" data-testid="operations-summary">
        <span>
          <b data-testid="operations-count" className="text-slate-900">{filtered.length}</b> opérations
        </span>
        <span>
          Entrées <b className="text-emerald-700 tabular">{money(totals.inc)}</b>
        </span>
        <span>
          Sorties <b className="text-rose-700 tabular">{money(totals.out)}</b>
        </span>
        {toReview > 0 && (
          <button data-testid="filter-to-review-shortcut" onClick={() => setStatus("to_review")} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 transition-colors hover:bg-amber-100">
            {toReview} à vérifier
          </button>
        )}
      </div>

      <Panel className="p-0 sm:p-0 overflow-hidden" testid="operations-table-panel">
        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState title="Aucune opération ne correspond" text="Modifiez vos filtres ou ajoutez une nouvelle opération." action={<Button onClick={() => openTxDialog()}>Ajouter une opération</Button>} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-3 py-3 font-semibold">Description</th>
                  <th className="px-3 py-3 font-semibold">Compte</th>
                  <th className="px-3 py-3 font-semibold">Catégorie</th>
                  <th className="px-3 py-3 font-semibold">Type</th>
                  <th className="px-3 py-3 text-right font-semibold">Montant</th>
                  <th className="px-3 py-3 font-semibold">Origine</th>
                  <th className="w-12 px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, limit).map((t) => (
                  <tr key={t.id} data-testid="operation-row" className="border-b border-slate-50 transition-colors hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-5 py-3 text-slate-500 tabular">{fmtDate(t.date)}</td>
                    <td className="max-w-[280px] px-3 py-3">
                      <button className="block max-w-full truncate text-left font-medium text-slate-800 hover:underline" onClick={() => openTxDialog(t)} data-testid="operation-description">
                        {t.description}
                      </button>
                      {((t.tags?.length ?? 0) > 0 || (t.attachments?.length ?? 0) > 0 || isRecurringTx(data, t)) && (
                        <span className="mt-1 flex flex-wrap items-center gap-1">
                          {isRecurringTx(data, t) && (
                            <span data-testid="operation-recurring-chip" className="inline-flex items-center gap-0.5 rounded-full bg-cyan-50 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-800 ring-1 ring-cyan-200">
                              <Repeat className="size-2.5" /> Récurrente
                            </span>
                          )}
                          {(t.tags ?? []).map((x) => (
                            <button key={x} data-testid="operation-tag" onClick={() => setTag(x)} className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800 ring-1 ring-violet-200">
                              #{x}
                            </button>
                          ))}
                          {(t.attachments?.length ?? 0) > 0 && (
                            <span data-testid="operation-attachments" className="inline-flex items-center gap-0.5 text-[10px] text-slate-500">
                              <Paperclip className="size-3" /> {t.attachments!.length}
                            </span>
                          )}
                        </span>
                      )}
                      {t.note && (
                        <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-400">
                          <StickyNote className="size-3" /> {t.note}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                      <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: data.accounts.find((a) => a.id === t.accountId)?.color }} />
                      {accName(t.accountId)}
                      {t.internal && t.counterpartAccountId && (
                        <span data-testid="operation-transfer-route" className="mt-0.5 block text-[11px] text-slate-400">
                          {t.amount < 0 ? "→ " : "← "}
                          {accName(t.counterpartAccountId)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-slate-700">{t.category}</span>
                        <CatStatusBadge status={t.catStatus} />
                        {(() => {
                          if (t.catStatus !== "to_review" && !["", "Non classé"].includes(t.category)) return null;
                          const sug = suggestCategory(data, t);
                          if (!sug) return null;
                          const others = sug.similarIds.filter((id) => id !== t.id);
                          return (
                            <span className="flex flex-wrap items-center gap-1 text-[11px]" data-testid="operation-suggestion">
                              <Sparkles className="size-3 text-violet-500" />
                              <span className="text-slate-500">
                                {sug.category} · {Math.round(sug.confidence * 100)} %{sug.confidence < LOW_CONFIDENCE ? " (faible)" : ""}
                              </span>
                              <button data-testid="operation-suggestion-apply" onClick={() => applySuggestion(t, sug.category, [])} className="font-semibold text-violet-700 hover:underline">
                                Appliquer
                              </button>
                              {others.length > 0 && (
                                <button data-testid="operation-suggestion-apply-all" onClick={() => applySuggestion(t, sug.category, others)} className="font-semibold text-violet-700 hover:underline">
                                  + {others.length} similaire{others.length > 1 ? "s" : ""}
                                </button>
                              )}
                            </span>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <TypeBadge type={t.type} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Amount value={t.amount} currency={t.currency} type={t.type} />
                    </td>
                    <td className="px-3 py-3">
                      <SourceBadge source={t.source} />
                    </td>
                    <td className="px-3 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" data-testid="operation-actions-button" aria-label="Actions" />}>
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem data-testid="operation-edit" onClick={() => openTxDialog(t)}>
                            <Pencil /> Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            data-testid="operation-duplicate"
                            onClick={() => {
                              const c = duplicateTransaction(t.id);
                              toast.success("Opération dupliquée", { action: c ? { label: "Modifier", onClick: () => openTxDialog(c) } : undefined });
                            }}
                          >
                            <Copy /> Dupliquer
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" data-testid="operation-delete" onClick={() => setToDelete(t)}>
                            <Trash2 /> Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > limit && (
              <div className="p-4 text-center">
                <Button variant="outline" data-testid="operations-load-more" onClick={() => setLimit((l) => l + PAGE * 2)} className="rounded-xl">
                  Afficher plus ({filtered.length - limit} restantes)
                </Button>
              </div>
            )}
          </div>
        )}
      </Panel>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Supprimer cette opération ?"
        description={toDelete ? `« ${toDelete.description} » du ${fmtDate(toDelete.date)} (${money(toDelete.amount, toDelete.currency, true)}) sera définitivement supprimée.` : ""}
        onConfirm={() => {
          if (toDelete) deleteTransaction(toDelete.id);
          toastUndo("Opération supprimée");
        }}
      />
      <CsvImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
