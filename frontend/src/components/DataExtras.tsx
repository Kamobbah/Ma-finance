import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArchiveRestore, Download, History, RefreshCcw, Save, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip, ConfirmDialog, EmptyState, Panel, PanelTitle } from "@/components/kit";
import { autoBackup, cancelImport, emptyTrash, listBackups, reprocessImport, restoreBackup, restoreFromTrash, useData, type LocalBackup } from "@/lib/store";
import { downloadFile, toCsv } from "@/lib/csv";
import { goalStats, kindOf, priorityOf } from "@/lib/goals";
import { fmtDate, money } from "@/lib/format";
import { toastUndo } from "@/lib/undo";
import type { ImportBatch } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND_LABEL = { transaction: "Opération", goal: "Objectif", recurrence: "Récurrence", budget: "Budget" } as const;
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function GoalsExportButtons() {
  const data = useData();
  const run = (kind: "csv" | "json") => {
    if (!data.goals.length) return toast.error("Aucun objectif à exporter");
    const stamp = new Date().toISOString().slice(0, 10);
    if (kind === "json") downloadFile(`ma-finance-objectifs-${stamp}.json`, JSON.stringify(data.goals, null, 2), "application/json");
    else
      downloadFile(
        `ma-finance-objectifs-${stamp}.csv`,
        toCsv([
          ["Nom", "Type", "Priorité", "Statut", "Alloué", "Cible", "Mensuel prévu", "Mensuel requis", "Date cible", "Projeté fin d'année", "Créé le"],
          ...data.goals.map((g) => {
            const s = goalStats(g);
            const n = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));
            return [g.name, kindOf(g), priorityOf(g), g.status, n(g.allocated), n(s.target), n(s.planned || null), n(s.required), g.targetDate ?? "", n(s.projectedYear), g.createdAt.slice(0, 10)];
          }),
        ]),
        "text/csv;charset=utf-8",
      );
    toast.success("Objectifs exportés");
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" className="rounded-xl" data-testid="export-goals-csv" onClick={() => run("csv")}>
        <Download /> Objectifs (CSV)
      </Button>
      <Button variant="outline" size="sm" className="rounded-xl" data-testid="export-goals-json" onClick={() => run("json")}>
        <Download /> Objectifs (JSON)
      </Button>
    </div>
  );
}

export function ImportHistoryPanel() {
  const data = useData();
  const [toCancel, setToCancel] = useState<ImportBatch | null>(null);
  const list = data.imports ?? [];
  const accName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? "—";
  return (
    <Panel className="mt-5" testid="import-history-panel">
      <PanelTitle sub="Chaque import est annulable ou retraitable en un clic">
        <span className="flex items-center gap-2">
          <History className="size-4 text-slate-500" /> Historique des imports
        </span>
      </PanelTitle>
      {list.length === 0 ? (
        <p className="text-sm text-slate-400">Aucun import enregistré pour l'instant (le relevé initial n'est pas listé).</p>
      ) : (
        <ul className="space-y-2">
          {list.map((b) => {
            const live = data.transactions.filter((t) => t.importId === b.id).length;
            const mismatch = b.reconciliation.some((r) => Math.abs(r.diff) >= 0.01 || r.firstMismatch);
            return (
              <li key={b.id} data-testid="import-history-row" className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-slate-50 p-3 text-sm", b.status === "cancelled" && "opacity-60")}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{b.fileName}</p>
                  <p className="text-xs text-slate-500">
                    {fmtDateTime(b.at)} · {b.format.toUpperCase()} · {b.accountIds.map(accName).join(", ")}
                  </p>
                </div>
                <span className="text-xs tabular text-slate-600">
                  +{b.added} · {b.duplicates} doublons · {b.errors} erreurs · {b.review} à vérifier
                </span>
                {b.status === "cancelled" ? <Chip className="bg-slate-100 text-slate-500 ring-slate-200">Annulé</Chip> : mismatch ? <Chip className="bg-rose-50 text-rose-800 ring-rose-200">Écart de solde</Chip> : <Chip className="bg-emerald-50 text-emerald-800 ring-emerald-200">Rapproché</Chip>}
                {b.status === "active" && (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="h-8 rounded-xl" data-testid="import-reprocess" onClick={() => toast.success(`${reprocessImport(b.id)} opération(s) recatégorisée(s)`)}>
                      <RefreshCcw /> Retraiter
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 rounded-xl text-rose-700" data-testid="import-cancel" onClick={() => setToCancel(b)}>
                      <Undo2 /> Annuler ({live})
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={!!toCancel}
        onOpenChange={(o) => !o && setToCancel(null)}
        title="Annuler cet import ?"
        description={`Les opérations ajoutées par « ${toCancel?.fileName} » seront retirées. Vous pourrez revenir en arrière avec « Annuler » dans la notification.`}
        onConfirm={() => {
          if (toCancel) toastUndo(`${cancelImport(toCancel.id)} opérations retirées`);
        }}
      />
    </Panel>
  );
}

export function TrashPanel() {
  const data = useData();
  const trash = data.trash ?? [];
  return (
    <Panel className="mt-5" testid="trash-panel">
      <PanelTitle
        sub="Éléments supprimés ces 30 derniers jours"
        aside={
          trash.length > 0 && (
            <Button size="sm" variant="ghost" className="rounded-xl text-rose-700" data-testid="trash-empty" onClick={() => emptyTrash()}>
              <Trash2 /> Vider
            </Button>
          )
        }
      >
        Corbeille
      </PanelTitle>
      {trash.length === 0 ? (
        <EmptyState testid="trash-empty-state" title="Corbeille vide" text="Les opérations, objectifs, récurrences et budgets supprimés apparaissent ici." />
      ) : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {trash.map((t) => (
            <li key={t.id} data-testid="trash-row" className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <Chip className="bg-white text-slate-600 ring-slate-200">{KIND_LABEL[t.kind]}</Chip>
              <span className="min-w-0 flex-1 truncate text-slate-800">
                {t.label}
                {t.kind === "transaction" && "amount" in t.item && <span className="ml-2 text-xs text-slate-500 tabular">{fmtDate((t.item as { date: string }).date)} · {money((t.item as { amount: number }).amount)}</span>}
              </span>
              <span className="hidden text-xs text-slate-400 sm:inline">{fmtDateTime(t.deletedAt)}</span>
              <Button size="sm" variant="outline" className="h-8 rounded-xl" data-testid="trash-restore" onClick={() => (restoreFromTrash(t.id), toast.success("Élément restauré"))}>
                <ArchiveRestore /> Restaurer
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function BackupsPanel() {
  const [list, setList] = useState<LocalBackup[]>([]);
  const refresh = () => listBackups().then(setList);
  useEffect(() => {
    refresh();
  }, []);
  return (
    <Panel className="mt-5" testid="backups-panel">
      <PanelTitle
        sub="Une copie automatique par jour à l'ouverture, 7 conservées sur cet appareil"
        aside={
          <Button size="sm" variant="outline" className="rounded-xl" data-testid="backup-now" onClick={() => autoBackup(true).then(() => (refresh(), toast.success("Sauvegarde locale créée")))}>
            <Save /> Sauvegarder maintenant
          </Button>
        }
      >
        Sauvegardes automatiques
      </PanelTitle>
      {list.length === 0 ? (
        <p className="text-sm text-slate-400">Aucune sauvegarde pour l'instant.</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((b) => (
            <li key={b.at} data-testid="backup-row" className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <span className="font-medium text-slate-800">{fmtDateTime(b.at)}</span>
              <span className="text-xs text-slate-500">
                {b.data.transactions.length} opérations · {b.data.goals.length} objectifs
              </span>
              <span className="ml-auto flex gap-1.5">
                <Button size="sm" variant="ghost" className="h-8 rounded-xl" data-testid="backup-download" onClick={() => downloadFile(`ma-finance-sauvegarde-${b.at.slice(0, 10)}.json`, JSON.stringify(b.data), "application/json")}>
                  <Download /> Télécharger
                </Button>
                <Button size="sm" variant="outline" className="h-8 rounded-xl" data-testid="backup-restore" onClick={() => restoreBackup(b.at).then((ok) => ok && toastUndo("Sauvegarde restaurée"))}>
                  <ArchiveRestore /> Restaurer
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
