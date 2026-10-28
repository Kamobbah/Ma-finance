import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileUp, AlertTriangle, CheckCircle2, FileWarning, Scale } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Amount, Chip, Field, NativeSelect } from "@/components/kit";
import { recordImport, useData } from "@/lib/store";
import { accountOptions } from "@/lib/ui";
import { parseAmount, parseCsv, parseDate } from "@/lib/csv";
import { isRevolutStatement, parseRevolutStatement } from "@/lib/revolut";
import { applyRules, INTERNAL_CATEGORY } from "@/lib/rules";
import { accountBalance } from "@/lib/analytics";
import { fmtDate, money, round2, uid } from "@/lib/format";
import type { Account, ImportBatch, Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";

type MapKey = "date" | "description" | "amount" | "debit" | "credit" | "balance" | "category" | "account" | "note";
const MAP_LABELS: Record<MapKey, string> = {
  date: "Date *",
  description: "Description *",
  amount: "Montant (signé)",
  debit: "Débit (sortie)",
  credit: "Crédit (entrée)",
  balance: "Solde après opération",
  category: "Catégorie",
  account: "Compte",
  note: "Note",
};
const GUESS: Record<MapKey, RegExp> = {
  date: /date/i,
  description: /descr|libell|label|intitul/i,
  amount: /montant|amount|entrant|valeur/i,
  debit: /d[ée]bit/i,
  credit: /cr[ée]dit/i,
  balance: /solde|balance/i,
  category: /cat[ée]g/i,
  account: /compte|account/i,
  note: /note|comment/i,
};
const EMPTY_MAP = { date: "", description: "", amount: "", debit: "", credit: "", balance: "", category: "", account: "", note: "" } as Record<MapKey, string>;
const CREATE = "__create__";

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
export const dupKey = (t: Pick<Transaction, "date" | "accountId" | "amount" | "description">) => `${t.date}|${t.accountId}|${t.amount.toFixed(2)}|${norm(t.description)}`;

interface Recon {
  accountId: string;
  statement: number;
  computed: number;
  diff: number;
  firstMismatch?: string; // id de l'opération où l'écart apparaît
}

/** Vérifie la chaîne des soldes du relevé (ordre du fichier, croissant ou décroissant) et la compare au solde calculé. */
function reconcile(txs: Transaction[], existing: Transaction[], accounts: Account[]): Recon[] {
  const out: Recon[] = [];
  const byAcc = new Map<string, Transaction[]>();
  for (const t of txs) if (t.balance !== undefined) byAcc.set(t.accountId, [...(byAcc.get(t.accountId) ?? []), t]);
  for (const [accId, list] of byAcc) {
    const acc = accounts.find((a) => a.id === accId);
    if (!acc || list.length < 1) continue;
    const ok = (prev: Transaction, cur: Transaction) => Math.abs(prev.balance! + cur.amount - cur.balance!) < 0.011;
    let asc = 0;
    let desc = 0;
    for (let i = 1; i < list.length; i++) {
      if (ok(list[i - 1], list[i])) asc++;
      if (ok(list[i], list[i - 1])) desc++;
    }
    const chrono = desc > asc ? [...list].reverse() : list;
    let firstMismatch: string | undefined;
    for (let i = 1; i < chrono.length; i++) if (!ok(chrono[i - 1], chrono[i])) {
      firstMismatch = chrono[i].id;
      break;
    }
    const last = chrono[chrono.length - 1];
    const all = [...existing, ...txs.filter((t) => t.accountId === accId)];
    const computed = round2(accountBalance(acc, all, last.date));
    const statement = round2(last.balance!);
    const diff = round2(statement - computed);
    if (!firstMismatch && Math.abs(diff) >= 0.01) {
      // l'écart vient d'avant le fichier : solde de départ incohérent avec la première ligne
      firstMismatch = chrono[0].id;
    }
    out.push({ accountId: accId, statement, computed, diff, firstMismatch: Math.abs(diff) >= 0.01 || firstMismatch ? firstMismatch : undefined });
  }
  return out;
}

export default function CsvImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const data = useData();
  const [fileName, setFileName] = useState("");
  const [format, setFormat] = useState<ImportBatch["format"]>("csv");
  const [rows, setRows] = useState<string[][]>([]);
  const [revolut, setRevolut] = useState<{ accounts: Account[]; transactions: Transaction[] } | null>(null);
  const [target, setTarget] = useState<Record<string, string>>({}); // compte détecté -> compte cible
  const [mapping, setMapping] = useState<Record<MapKey, string>>(EMPTY_MAP);
  const [defaultAccount, setDefaultAccount] = useState("");
  const [skipDup, setSkipDup] = useState(true);
  const [useRules, setUseRules] = useState(true);
  const [report, setReport] = useState<ImportBatch | null>(null);

  const reset = () => {
    setFileName("");
    setRows([]);
    setRevolut(null);
    setTarget({});
    setReport(null);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setReport(null);
    let text = "";
    const isXlsx = /\.xlsx$/i.test(f.name);
    try {
      if (isXlsx) {
        const { default: readXlsxFile } = await import("read-excel-file/browser");
        const cell = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? "" : `"${String(v).replace(/"/g, '""')}"`);
        text = (await readXlsxFile(f)).flatMap((sh) => sh.data.map((row) => row.map(cell).join(","))).join("\n");
      } else text = await f.text();
    } catch {
      return toast.error("Fichier illisible : format non reconnu");
    }
    setFileName(f.name);
    setFormat(isXlsx ? "xlsx" : "csv");
    if (isRevolutStatement(text)) {
      const parsed = parseRevolutStatement(text, data.accounts);
      setRevolut(parsed);
      setFormat("revolut");
      const t: Record<string, string> = {};
      for (const a of parsed.accounts) if (parsed.transactions.some((x) => x.accountId === a.id)) t[a.id] = data.accounts.some((e) => e.id === a.id) ? a.id : CREATE;
      setTarget(t);
      setRows([]);
      return;
    }
    setRevolut(null);
    const parsed = parseCsv(text).filter((r) => r.some((c) => c.trim()));
    if (parsed.length < 2) return toast.error("Fichier vide ou illisible");
    setRows(parsed);
    const headers = parsed[0];
    const m = { ...EMPTY_MAP };
    const used = new Set<number>();
    (Object.keys(GUESS) as MapKey[]).forEach((k) => {
      const idx = headers.findIndex((h, i) => !used.has(i) && GUESS[k].test(h));
      if (idx >= 0) {
        m[k] = String(idx);
        used.add(idx);
      }
    });
    setMapping(m);
    setDefaultAccount(data.accounts.find((a) => a.type === "main")?.id ?? data.accounts[0]?.id ?? "");
  };

  const { candidates, errors } = useMemo(() => {
    let txs: Transaction[] = [];
    const errs: { line: number; reason: string }[] = [];
    if (revolut) {
      const remap = (id?: string) => (id && target[id] && target[id] !== CREATE ? target[id] : id);
      txs = revolut.transactions.filter((t) => target[t.accountId] !== undefined || data.accounts.some((a) => a.id === t.accountId)).map((t) => ({ ...t, accountId: remap(t.accountId)!, counterpartAccountId: remap(t.counterpartAccountId) }));
    } else if (rows.length > 1) {
      const col = (r: string[], k: MapKey) => (mapping[k] !== "" ? (r[Number(mapping[k])] ?? "") : "");
      rows.slice(1).forEach((r, i) => {
        const line = i + 2;
        const date = parseDate(col(r, "date"));
        const description = col(r, "description").trim();
        let amount = mapping.amount !== "" ? parseAmount(col(r, "amount")) : null;
        if (amount === null && (mapping.debit !== "" || mapping.credit !== "")) {
          const d = parseAmount(col(r, "debit")) ?? 0;
          const c = parseAmount(col(r, "credit")) ?? 0;
          amount = c - Math.abs(d);
        }
        if (!date) return errs.push({ line, reason: "date invalide" });
        if (!description) return errs.push({ line, reason: "description vide" });
        if (amount === null || !Number.isFinite(amount)) return errs.push({ line, reason: "montant invalide" });
        if (amount === 0) return errs.push({ line, reason: "montant nul" });
        const accLabel = norm(col(r, "account"));
        const acc = (accLabel && data.accounts.find((a) => norm(a.name) === accLabel || a.id === accLabel)) || data.accounts.find((a) => a.id === defaultAccount);
        if (!acc) return errs.push({ line, reason: "compte inconnu" });
        const cat = col(r, "category").trim();
        const knownCat = data.categories.find((c) => norm(c.name) === norm(cat));
        const bal = mapping.balance !== "" ? parseAmount(col(r, "balance")) : null;
        txs.push({
          id: uid(),
          date,
          accountId: acc.id,
          description,
          category: knownCat?.name ?? "",
          type: amount > 0 ? "income" : "expense",
          amount: round2(amount),
          currency: acc.currency,
          note: col(r, "note").trim() || undefined,
          internal: false,
          source: "import",
          catStatus: knownCat ? "manual" : "to_review",
          createdAt: new Date(Date.now() + i).toISOString(),
          balance: bal ?? undefined,
        });
      });
    }
    // Doublons : date, description, montant, compte (+ solde quand il est connu des deux côtés)
    const existing = new Map<string, (number | undefined)[]>();
    for (const t of data.transactions) existing.set(dupKey(t), [...(existing.get(dupKey(t)) ?? []), t.balance]);
    const out = txs.map((tx) => {
      const list = existing.get(dupKey(tx));
      if (!list?.length) return { tx, dup: false };
      const idx = list.findIndex((b) => b === undefined || tx.balance === undefined || Math.abs(b - tx.balance) < 0.011);
      if (idx < 0) return { tx, dup: false };
      list.splice(idx, 1);
      return { tx, dup: true };
    });
    return { candidates: out, errors: errs };
  }, [revolut, rows, mapping, defaultAccount, data, target]);

  const toImport = candidates.filter((c) => !skipDup || !c.dup).map((c) => c.tx);
  const dupCount = candidates.filter((c) => c.dup).length;
  const newAccounts = revolut ? revolut.accounts.filter((a) => target[a.id] === CREATE && !data.accounts.some((e) => e.id === a.id)) : [];
  const recon = useMemo(() => reconcile(toImport, data.transactions, [...data.accounts, ...newAccounts]), [toImport, data, newAccounts]); // eslint-disable-line react-hooks/exhaustive-deps
  const mismatchIds = new Set(recon.map((r) => r.firstMismatch).filter(Boolean) as string[]);
  const allAccounts = [...data.accounts, ...(revolut?.accounts ?? [])];
  const accName = (id: string) => allAccounts.find((a) => a.id === id)?.name ?? "—";

  const confirm = () => {
    if (!toImport.length) return toast.error("Aucune opération à importer");
    const final = useRules ? toImport.map((t) => applyRules(t, data.rules)) : toImport.map((t) => (t.category ? t : { ...t, category: t.internal ? INTERNAL_CATEGORY : "Non classé" }));
    const batch: ImportBatch = {
      id: uid(),
      fileName,
      at: new Date().toISOString(),
      format,
      added: final.length,
      duplicates: skipDup ? dupCount : 0,
      errors: errors.length,
      review: final.filter((t) => t.catStatus === "to_review").length,
      accountIds: [...new Set(final.map((t) => t.accountId))],
      status: "active",
      reconciliation: recon,
    };
    recordImport(batch, final, newAccounts);
    setReport(batch);
    toast.success(`${final.length} opérations importées`);
  };

  const headerOpts = rows[0]?.map((h, i) => ({ value: String(i), label: h || `Colonne ${i + 1}` })) ?? [];
  const hasData = candidates.length > 0;
  const close = () => {
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
      <DialogContent data-testid="csv-import-dialog" className="max-h-[92vh] overflow-y-auto rounded-3xl p-6 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{report ? "Rapport d'import" : "Importer des opérations (CSV / Excel)"}</DialogTitle>
          <DialogDescription>{report ? `« ${report.fileName} » — l'import est annulable à tout moment depuis la page Données.` : "Rien n'est ajouté avant votre confirmation. Les relevés Revolut sont reconnus automatiquement (comptes, Pockets, épargne) ; pour les autres fichiers, choisissez la correspondance des colonnes."}</DialogDescription>
        </DialogHeader>

        {report ? (
          <ImportReport batch={report} accName={accName} />
        ) : (
          <>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-6 py-7 text-center transition-colors hover:border-slate-300 hover:bg-slate-50">
              <FileUp className="size-6 text-slate-500" />
              <span className="text-sm font-semibold text-slate-700">{fileName || "Choisir un fichier .csv ou .xlsx"}</span>
              <span className="text-xs text-slate-500">Format et séparateurs détectés automatiquement</span>
              <input data-testid="csv-file-input" type="file" accept=".csv,text/csv,.xlsx" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>

            {revolut && (
              <div data-testid="revolut-detected" className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900">
                <p className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> Relevé Revolut détecté : {Object.keys(target).length} sections de comptes. Choisissez le compte cible de chacune.
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {Object.keys(target).map((id) => {
                    const src = revolut.accounts.find((a) => a.id === id)!;
                    const n = revolut.transactions.filter((t) => t.accountId === id).length;
                    return (
                      <Field key={id} label={`${src.name} (${src.currency}) · ${n} op.`}>
                        <NativeSelect
                          testid={`import-target-${id}`}
                          value={target[id]}
                          onChange={(v) => setTarget((t) => ({ ...t, [id]: v }))}
                          options={[...(data.accounts.some((a) => a.id === id) ? [] : [{ value: CREATE, label: `Créer « ${src.name} »` }]), ...data.accounts.filter((a) => a.currency === src.currency).map((a) => ({ value: a.id, label: a.name }))]}
                          className="w-full bg-white"
                        />
                      </Field>
                    );
                  })}
                </div>
              </div>
            )}

            {rows.length > 0 && (
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="mb-3 text-sm font-semibold text-slate-800">Correspondance des colonnes</p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {(Object.keys(MAP_LABELS) as MapKey[]).map((k) => (
                    <Field key={k} label={MAP_LABELS[k]}>
                      <NativeSelect testid={`csv-map-${k}`} value={mapping[k]} onChange={(v) => setMapping((m) => ({ ...m, [k]: v }))} options={headerOpts} placeholder="— Ignorer —" className="w-full" />
                    </Field>
                  ))}
                  <Field label="Compte ou Pocket cible" className="col-span-2">
                    <NativeSelect testid="csv-default-account" value={defaultAccount} onChange={setDefaultAccount} options={accountOptions(data.accounts)} className="w-full" />
                  </Field>
                </div>
              </div>
            )}

            {(rows.length > 0 || revolut) && (
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                  <span data-testid="csv-preview-count" className="font-semibold text-slate-800">
                    {candidates.length} opérations lues
                  </span>
                  {dupCount > 0 && (
                    <Chip testid="csv-duplicates-count" className="bg-amber-50 text-amber-800 ring-amber-200">
                      <AlertTriangle className="size-3" /> {dupCount} doublons
                    </Chip>
                  )}
                  {errors.length > 0 && (
                    <Chip testid="csv-errors-count" className="bg-rose-50 text-rose-800 ring-rose-200">
                      <FileWarning className="size-3" /> {errors.length} lignes en erreur
                    </Chip>
                  )}
                  <label className="ml-auto flex items-center gap-2 text-xs text-slate-600">
                    <Checkbox data-testid="csv-skip-duplicates" checked={skipDup} onCheckedChange={(c) => setSkipDup(!!c)} /> Ignorer les doublons
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <Checkbox data-testid="csv-apply-rules" checked={useRules} onCheckedChange={(c) => setUseRules(!!c)} /> Catégoriser avec les règles
                  </label>
                </div>
                {errors.length > 0 && (
                  <p className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800" data-testid="csv-errors-list">
                    {errors.slice(0, 6).map((e) => `ligne ${e.line} : ${e.reason}`).join(" · ")}
                    {errors.length > 6 ? ` · … +${errors.length - 6}` : ""}
                  </p>
                )}
                {recon.length > 0 && <ReconList recon={recon} accName={accName} txs={toImport} />}
                {hasData ? (
                  <div className="mt-2 max-h-72 overflow-auto rounded-2xl border border-slate-100">
                    <table className="w-full text-xs" data-testid="csv-preview-table">
                      <thead className="sticky top-0 bg-white text-left text-[10px] uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Description</th>
                          <th className="px-3 py-2">Compte</th>
                          <th className="px-3 py-2 text-right">Montant</th>
                          <th className="px-3 py-2 text-right">Solde relevé</th>
                          <th className="px-3 py-2">État</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...candidates.filter((c) => mismatchIds.has(c.tx.id)), ...candidates.filter((c) => !mismatchIds.has(c.tx.id)).slice(0, 80)].map(({ tx, dup }) => (
                          <tr key={tx.id} data-testid={mismatchIds.has(tx.id) ? "csv-mismatch-row" : undefined} className={cn(dup && "bg-amber-50/60 text-slate-400", mismatchIds.has(tx.id) && "bg-rose-50 font-semibold text-rose-900")}>
                            <td className="whitespace-nowrap px-3 py-1.5">{fmtDate(tx.date)}</td>
                            <td className="max-w-[220px] truncate px-3 py-1.5">{tx.description}</td>
                            <td className="whitespace-nowrap px-3 py-1.5">{accName(tx.accountId)}</td>
                            <td className="px-3 py-1.5 text-right">
                              <Amount value={tx.amount} />
                            </td>
                            <td className="px-3 py-1.5 text-right tabular">{tx.balance !== undefined ? money(tx.balance) : "—"}</td>
                            <td className="px-3 py-1.5">{mismatchIds.has(tx.id) ? "Écart de solde" : dup ? "Doublon" : tx.internal ? "Virement interne" : "Nouveau"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {candidates.length > 80 && <p className="p-2 text-center text-[11px] text-slate-400">… et {candidates.length - 80} autres</p>}
                  </div>
                ) : (
                  <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Aucune ligne valide : vérifiez la correspondance (date, description et montant sont requis).</p>
                )}
              </div>
            )}
          </>
        )}

        <DialogFooter className="-mx-6 -mb-6 rounded-b-3xl px-6">
          {report ? (
            <Button data-testid="csv-report-close" onClick={close}>
              Terminer
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={close} data-testid="csv-cancel-button">
                Annuler
              </Button>
              <Button data-testid="csv-confirm-import" disabled={!toImport.length} onClick={confirm}>
                Importer {toImport.length} opérations
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReconList({ recon, accName, txs }: { recon: Recon[]; accName: (id: string) => string; txs: Transaction[] }) {
  return (
    <div className="mb-2 space-y-1.5" data-testid="csv-reconciliation">
      {recon.map((r) => {
        const ok = Math.abs(r.diff) < 0.01 && !r.firstMismatch;
        const first = txs.find((t) => t.id === r.firstMismatch);
        return (
          <div key={r.accountId} data-testid="csv-recon-row" className={cn("flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-xl px-3 py-2 text-xs", ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900")}>
            <Scale className="size-3.5" />
            <b>{accName(r.accountId)}</b>
            <span className="tabular">
              Relevé {money(r.statement)} · calculé {money(r.computed)}
            </span>
            {ok ? <span>Rapprochement OK</span> : <span className="font-semibold">Écart {money(r.diff, "EUR", true)}{first ? ` — apparaît le ${fmtDate(first.date)} (« ${first.description} »)` : ""}</span>}
          </div>
        );
      })}
    </div>
  );
}

export function ImportReport({ batch, accName }: { batch: ImportBatch; accName: (id: string) => string }) {
  const cells = [
    ["Ajoutées", batch.added, "text-emerald-700", "report-added"],
    ["Doublons ignorés", batch.duplicates, "text-amber-700", "report-duplicates"],
    ["Erreurs", batch.errors, "text-rose-700", "report-errors"],
    ["À vérifier", batch.review, "text-violet-700", "report-review"],
  ] as const;
  return (
    <div data-testid="import-report" className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cells.map(([l, v, c, id]) => (
          <div key={id} className="rounded-2xl bg-slate-50 p-3">
            <p className="text-[11px] text-slate-500">{l}</p>
            <p data-testid={id} className={cn("text-2xl font-extrabold tabular", c)}>
              {v}
            </p>
          </div>
        ))}
      </div>
      {batch.reconciliation.length > 0 && (
        <div className="space-y-1.5">
          {batch.reconciliation.map((r) => (
            <div key={r.accountId} className={cn("flex flex-wrap gap-x-3 rounded-xl px-3 py-2 text-xs", Math.abs(r.diff) < 0.01 && !r.firstMismatch ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900")}>
              <b>{accName(r.accountId)}</b>
              <span className="tabular">
                Relevé {money(r.statement)} · calculé {money(r.computed)} · écart {money(r.diff, "EUR", true)}
              </span>
            </div>
          ))}
        </div>
      )}
      {batch.review > 0 && <p className="text-xs text-slate-500">Les opérations « à vérifier » sont filtrables dans Opérations (Statut : À vérifier), avec une catégorie suggérée d'après vos opérations similaires.</p>}
    </div>
  );
}
