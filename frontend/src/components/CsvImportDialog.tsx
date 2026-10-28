import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Amount, Chip, Field, NativeSelect } from "@/components/kit";
import { addTransactions, saveAccount, useData } from "@/lib/store";
import { accountOptions } from "@/lib/ui";
import { parseAmount, parseCsv, parseDate } from "@/lib/csv";
import { isRevolutStatement, parseRevolutStatement } from "@/lib/revolut";
import { applyRules } from "@/lib/rules";
import { fmtDate, uid } from "@/lib/format";
import type { Account, Transaction } from "@/lib/types";

type MapKey = "date" | "description" | "amount" | "debit" | "credit" | "category" | "account" | "note";
const MAP_LABELS: Record<MapKey, string> = {
  date: "Date *",
  description: "Description *",
  amount: "Montant (signé)",
  debit: "Débit (sortie)",
  credit: "Crédit (entrée)",
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
  category: /cat[ée]g/i,
  account: /compte|account/i,
  note: /note|comment/i,
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
export const dupKey = (t: Pick<Transaction, "date" | "accountId" | "amount" | "description">) => `${t.date}|${t.accountId}|${t.amount.toFixed(2)}|${norm(t.description)}`;

export default function CsvImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const data = useData();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<string[][]>([]);
  const [revolut, setRevolut] = useState<{ accounts: Account[]; transactions: Transaction[] } | null>(null);
  const [mapping, setMapping] = useState<Record<MapKey, string>>({ date: "", description: "", amount: "", debit: "", credit: "", category: "", account: "", note: "" });
  const [defaultAccount, setDefaultAccount] = useState("");
  const [skipDup, setSkipDup] = useState(true);
  const [useRules, setUseRules] = useState(true);

  const reset = () => {
    setFileName("");
    setRows([]);
    setRevolut(null);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    setFileName(f.name);
    if (isRevolutStatement(text)) {
      setRevolut(parseRevolutStatement(text, data.accounts));
      setRows([]);
      return;
    }
    setRevolut(null);
    const parsed = parseCsv(text).filter((r) => r.some((c) => c.trim()));
    if (parsed.length < 2) return toast.error("Fichier CSV vide ou illisible");
    setRows(parsed);
    const headers = parsed[0];
    const m = { date: "", description: "", amount: "", debit: "", credit: "", category: "", account: "", note: "" } as Record<MapKey, string>;
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

  const candidates: { tx: Transaction; dup: boolean }[] = useMemo(() => {
    let txs: Transaction[] = [];
    if (revolut) txs = revolut.transactions;
    else if (rows.length > 1) {
      const col = (r: string[], k: MapKey) => (mapping[k] !== "" ? (r[Number(mapping[k])] ?? "") : "");
      for (const r of rows.slice(1)) {
        const date = parseDate(col(r, "date"));
        const description = col(r, "description").trim();
        let amount = mapping.amount !== "" ? parseAmount(col(r, "amount")) : null;
        if (amount === null && (mapping.debit !== "" || mapping.credit !== "")) {
          const d = parseAmount(col(r, "debit")) ?? 0;
          const c = parseAmount(col(r, "credit")) ?? 0;
          amount = c - Math.abs(d);
        }
        if (!date || !description || amount === null || amount === 0) continue;
        const accLabel = norm(col(r, "account"));
        const acc = (accLabel && data.accounts.find((a) => norm(a.name) === accLabel || a.id === accLabel)) || data.accounts.find((a) => a.id === defaultAccount);
        if (!acc) continue;
        const cat = col(r, "category").trim();
        const knownCat = data.categories.find((c) => norm(c.name) === norm(cat));
        txs.push({
          id: uid(),
          date,
          accountId: acc.id,
          description,
          category: knownCat?.name ?? "",
          type: amount > 0 ? "income" : "expense",
          amount,
          currency: acc.currency,
          note: col(r, "note").trim() || undefined,
          internal: false,
          source: "import",
          catStatus: knownCat ? "manual" : "to_review",
          createdAt: new Date().toISOString(),
        });
      }
    }
    const counts = new Map<string, number>();
    for (const t of data.transactions) counts.set(dupKey(t), (counts.get(dupKey(t)) ?? 0) + 1);
    return txs.map((tx) => {
      const k = dupKey(tx);
      const c = counts.get(k) ?? 0;
      if (c > 0) counts.set(k, c - 1);
      return { tx, dup: c > 0 };
    });
  }, [revolut, rows, mapping, defaultAccount, data]);

  const toImport = candidates.filter((c) => !skipDup || !c.dup).map((c) => c.tx);
  const dupCount = candidates.filter((c) => c.dup).length;
  const newAccounts = revolut ? revolut.accounts.filter((a) => !data.accounts.some((e) => e.id === a.id)) : [];

  const confirm = () => {
    if (!toImport.length) return toast.error("Aucune opération à importer");
    newAccounts.forEach(saveAccount);
    const final = useRules ? toImport.map((t) => applyRules(t, data.rules)) : toImport.map((t) => (t.category ? t : { ...t, category: t.internal ? "Virements internes" : "Non classé" }));
    addTransactions(final, false);
    toast.success(`${final.length} opérations importées`, { description: dupCount && skipDup ? `${dupCount} doublons ignorés` : undefined });
    reset();
    onOpenChange(false);
  };

  const headerOpts = rows[0]?.map((h, i) => ({ value: String(i), label: h || `Colonne ${i + 1}` })) ?? [];
  const hasData = candidates.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent data-testid="csv-import-dialog" className="max-h-[92vh] overflow-y-auto rounded-3xl p-6 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Importer des opérations (CSV)</DialogTitle>
          <DialogDescription>Rien n'est ajouté avant votre confirmation. Les relevés Revolut sont reconnus automatiquement ; pour les autres fichiers, choisissez la correspondance des colonnes.</DialogDescription>
        </DialogHeader>

        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-6 py-7 text-center transition-colors hover:border-slate-300 hover:bg-slate-50">
          <FileUp className="size-6 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">{fileName || "Choisir un fichier .csv"}</span>
          <span className="text-xs text-slate-500">Séparateurs , ; ou tabulation détectés automatiquement</span>
          <input data-testid="csv-file-input" type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>

        {revolut && (
          <div data-testid="revolut-detected" className="flex items-start gap-2 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <span>
              Relevé Revolut détecté : comptes, Pockets et épargne normalisés automatiquement.
              {newAccounts.length > 0 && ` Nouveaux comptes : ${newAccounts.map((a) => a.name).join(", ")}.`}
            </span>
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
              <Field label="Compte par défaut" className="col-span-2">
                <NativeSelect testid="csv-default-account" value={defaultAccount} onChange={setDefaultAccount} options={accountOptions(data.accounts)} className="w-full" />
              </Field>
            </div>
          </div>
        )}

        {(rows.length > 0 || revolut) && (
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
              <span data-testid="csv-preview-count" className="font-semibold text-slate-800">
                {candidates.length} opérations lues
              </span>
              {dupCount > 0 && (
                <Chip testid="csv-duplicates-count" className="bg-amber-50 text-amber-800 ring-amber-200">
                  <AlertTriangle className="size-3" /> {dupCount} doublons détectés
                </Chip>
              )}
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <Checkbox data-testid="csv-skip-duplicates" checked={skipDup} onCheckedChange={(c) => setSkipDup(!!c)} /> Ignorer les doublons
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <Checkbox data-testid="csv-apply-rules" checked={useRules} onCheckedChange={(c) => setUseRules(!!c)} /> Catégoriser avec les règles
              </label>
            </div>
            {hasData ? (
              <div className="max-h-72 overflow-auto rounded-2xl border border-slate-100">
                <table className="w-full text-xs" data-testid="csv-preview-table">
                  <thead className="sticky top-0 bg-white text-left text-[10px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2">Compte</th>
                      <th className="px-3 py-2 text-right">Montant</th>
                      <th className="px-3 py-2">État</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.slice(0, 80).map(({ tx, dup }) => (
                      <tr key={tx.id} className={dup ? "bg-amber-50/60 text-slate-400" : ""}>
                        <td className="whitespace-nowrap px-3 py-1.5">{fmtDate(tx.date)}</td>
                        <td className="max-w-[240px] truncate px-3 py-1.5">{tx.description}</td>
                        <td className="whitespace-nowrap px-3 py-1.5">{(revolut?.accounts ?? data.accounts).find((a) => a.id === tx.accountId)?.name}</td>
                        <td className="px-3 py-1.5 text-right">
                          <Amount value={tx.amount} />
                        </td>
                        <td className="px-3 py-1.5">{dup ? "Doublon" : "Nouveau"}</td>
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

        <DialogFooter className="-mx-6 -mb-6 rounded-b-3xl px-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="csv-cancel-button">
            Annuler
          </Button>
          <Button data-testid="csv-confirm-import" disabled={!toImport.length} onClick={confirm}>
            Importer {toImport.length} opérations
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
