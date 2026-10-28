import { Link } from "react-router-dom";
import { AlertTriangle, Plus, Target } from "lucide-react";
import { Chip, Panel, PanelTitle, ProgressBar } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { useData } from "@/lib/store";
import { budgetStatuses, LEVEL_STYLES } from "@/lib/budgets";
import { money, MONTHS_LONG, todayIso } from "@/lib/format";
import type { Account } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Budgets du mois en cours rattachés à ce compte. */
export default function AccountBudgets({ acc }: { acc: Account }) {
  const data = useData();
  if (acc.currency !== "EUR") return null;
  const mk = todayIso().slice(0, 7);
  const list = budgetStatuses(data, mk).filter((s) => s.budget.accountId === acc.id);
  const month = MONTHS_LONG[Number(mk.slice(5)) - 1].toLowerCase();
  return (
    <Panel className="mt-5" testid="account-budgets-panel">
      <PanelTitle
        sub={`Plafonds de ${month} pour ce compte`}
        aside={
          <Link to={`/budgets?compte=${acc.id}`} data-testid="account-new-budget-link" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 rounded-xl")}>
            <Plus /> Budget pour ce compte
          </Link>
        }
      >
        <span className="flex items-center gap-2">
          <Target className="size-4 text-slate-500" /> Budget du compte
        </span>
      </PanelTitle>
      {list.length === 0 ? (
        <p className="text-sm text-slate-400" data-testid="account-budgets-empty">
          Aucun budget pour ce compte. Fixez un plafond global ou par catégorie pour suivre ses dépenses chaque mois.
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((s) => {
            const st = LEVEL_STYLES[s.level];
            return (
              <li key={s.budget.id} data-testid="account-budget-row" className="rounded-2xl bg-slate-50/70 p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-slate-900">{s.budget.category || "Toutes catégories"}</span>
                  <Chip className={st.chip}>
                    {s.level !== "ok" && <AlertTriangle className="size-3" />} {st.label}
                  </Chip>
                  <span className="ml-auto tabular">
                    <b className={st.text}>{money(s.spent)}</b>
                    <span className="text-slate-400"> / {money(s.limit)}</span>
                  </span>
                </div>
                <div className="mt-2">
                  <ProgressBar value={s.ratio} color={st.bar} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{s.remaining >= 0 ? `Reste ${money(s.remaining)}` : `Dépassement de ${money(-s.remaining)}`}</p>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
