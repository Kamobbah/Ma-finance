import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CalendarCheck2, Check, Undo2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { usePrefs } from "@/lib/store";
import { cancelBudgetPrep, validateBudgetPrep } from "@/lib/budgetPrep";
import { MONTHS_LONG } from "@/lib/format";
import { cn } from "@/lib/utils";

const monthName = (mk: string) => `${MONTHS_LONG[Number(mk.slice(5)) - 1].toLowerCase()} ${mk.slice(0, 4)}`;

/** Rappel à valider après la préparation automatique des budgets du mois suivant. */
export default function BudgetPrepBanner() {
  const prefs = usePrefs();
  const pending = Object.entries(prefs.budgetPrep ?? {})
    .filter(([, p]) => p.status === "pending")
    .sort(([a], [b]) => b.localeCompare(a));
  if (!pending.length) return null;
  const [mk, p] = pending[0];
  const n = p.changes.length;
  return (
    <div data-testid="budget-prep-banner" className="mb-6 flex flex-wrap items-center gap-3 rounded-3xl border border-violet-200/70 bg-gradient-to-r from-violet-50 to-white p-3 pl-4 shadow-[0_4px_20px_-10px_rgba(124,58,237,0.3)] animate-rise">
      <CalendarCheck2 className="size-5 shrink-0 text-violet-600" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-violet-950">Budgets de {monthName(mk)} préparés automatiquement</p>
        <p className="text-xs text-slate-600" data-testid="budget-prep-summary">
          Plafonds copiés depuis {monthName(p.from)} : {n ? `${n} ajustement${n > 1 ? "s" : ""} repris` : "identiques aux plafonds par défaut"}
          {p.kept ? ` · ${p.kept} ajustement${p.kept > 1 ? "s" : ""} manuel${p.kept > 1 ? "s" : ""} conservé${p.kept > 1 ? "s" : ""}` : ""}. Vérifiez puis validez.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to={`/budgets?mois=${mk}`} data-testid="budget-prep-review" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 rounded-xl")}>
          Vérifier
        </Link>
        <Button
          size="sm"
          className="h-8 rounded-xl"
          data-testid="budget-prep-validate"
          onClick={() => {
            validateBudgetPrep(mk);
            toast.success(`Budgets de ${monthName(mk)} validés`);
          }}
        >
          <Check /> Valider
        </Button>
        {n > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 rounded-xl text-slate-600"
            data-testid="budget-prep-cancel"
            onClick={() => {
              cancelBudgetPrep(mk);
              toast.success("Préparation annulée", { description: "Les plafonds par défaut s'appliquent à nouveau" });
            }}
          >
            <Undo2 /> Annuler
          </Button>
        )}
      </div>
    </div>
  );
}
