import { useMemo } from "react";
import { toast } from "sonner";
import { Check, EyeOff, Radar, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip, EmptyState, Panel, PanelTitle } from "@/components/kit";
import { dismissSubscription, restoreSubscriptions, saveRecurrence, useData } from "@/lib/store";
import { detectSubscriptions, type SubscriptionSuggestion } from "@/lib/subscriptions";
import { UNCATEGORIZED } from "@/lib/rules";
import { fmtDate, money, MONTHS, uid } from "@/lib/format";

export default function SubscriptionFinder() {
  const data = useData();
  const suggestions = useMemo(() => detectSubscriptions(data), [data]);
  const accName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? "—";

  const create = (s: SubscriptionSuggestion) => {
    const created = saveRecurrence({
      id: uid(),
      name: s.name,
      amount: s.amount,
      accountId: s.accountId,
      category: s.category === UNCATEGORIZED ? "Abonnements & numérique" : s.category,
      type: "expense",
      frequency: "monthly",
      interval: 1,
      intervalUnit: "months",
      startDate: s.nextDate,
      nextDate: s.nextDate,
      endMode: "never",
      status: "active",
      note: `Détecté automatiquement (${s.months} mois consécutifs).`,
      occurrences: 0,
      cumulated: 0,
    });
    toast.success(`Récurrence « ${s.name} » créée`, { description: `Prochaine échéance le ${fmtDate(s.nextDate)}${created ? ` · ${created} opération(s) créée(s)` : ""}` });
  };

  return (
    <Panel className="mt-5" testid="subscription-finder-panel">
      <PanelTitle
        sub="Dépenses au montant stable (±10 %) qui reviennent chaque mois depuis au moins 3 mois"
        aside={
          data.dismissedSubscriptions.length > 0 ? (
            <Button variant="ghost" size="sm" data-testid="subscriptions-restore-button" className="text-xs" onClick={restoreSubscriptions}>
              <RotateCcw /> Réafficher les ignorés ({data.dismissedSubscriptions.length})
            </Button>
          ) : undefined
        }
      >
        <span className="flex items-center gap-2">
          <Radar className="size-4 text-cyan-600" /> Abonnements détectés
          {suggestions.length > 0 && <Chip testid="subscriptions-count" className="bg-cyan-50 text-cyan-800 ring-cyan-200">{suggestions.length}</Chip>}
        </span>
      </PanelTitle>
      {suggestions.length === 0 ? (
        <EmptyState testid="subscriptions-empty" title="Aucun nouvel abonnement détecté" text="Toutes vos dépenses mensuelles régulières sont déjà suivies en récurrence (ou ont été ignorées)." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {suggestions.map((s) => (
            <div key={s.key} data-testid="subscription-suggestion" className="flex flex-col rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50/70 to-white p-4 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p data-testid="subscription-name" className="truncate font-semibold text-slate-900">
                    {s.name}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {accName(s.accountId)} · {s.category}
                  </p>
                </div>
                <p data-testid="subscription-amount" className="shrink-0 text-lg font-extrabold tabular text-slate-900">
                  {money(-s.amount, "EUR", true)}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {s.occurrences.slice(-6).map((o) => (
                  <span key={o.date} title={`${fmtDate(o.date)} · ${money(o.amount)}`} className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
                    {MONTHS[Number(o.date.slice(5, 7)) - 1]}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {s.months} mois de suite · prochaine échéance estimée <b className="text-slate-700">{fmtDate(s.nextDate)}</b>
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" data-testid="subscription-create-button" className="flex-1 rounded-xl" onClick={() => create(s)}>
                  <Check /> Suivre en récurrence
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="subscription-dismiss-button"
                  className="rounded-xl text-slate-500"
                  onClick={() => {
                    dismissSubscription(s.key);
                    toast("Suggestion ignorée");
                  }}
                >
                  <EyeOff /> Ignorer
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
