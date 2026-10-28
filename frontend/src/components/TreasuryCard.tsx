import { Link } from "react-router-dom";
import { Panel, PanelTitle } from "@/components/kit";
import { useData } from "@/lib/store";
import { SALARY_CATEGORY, treasury } from "@/lib/salary";
import { fmtDate, money } from "@/lib/format";
import { cn } from "@/lib/utils";

function Row({ label, value, hint, strong }: { label: string; value: number; hint?: string; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5", strong && "mt-1 border-t border-slate-200 pt-3")}>
      <span className={cn("text-sm", strong ? "font-bold text-slate-900" : "text-slate-600")}>
        {label}
        {hint && <span className="block text-xs font-normal text-slate-400">{hint}</span>}
      </span>
      <span className={cn("tabular whitespace-nowrap", strong ? "text-lg font-extrabold" : "font-semibold", strong && (value < 0 ? "text-rose-700" : "text-emerald-700"))}>{money(value, "EUR", true)}</span>
    </div>
  );
}

/** Trésorerie par cycle de paie : ce qui reste réellement jusqu'au prochain salaire. */
export default function TreasuryCard() {
  const data = useData();
  const t = treasury(data);
  if (!t)
    return (
      <Panel className="mt-5" testid="treasury-card">
        <PanelTitle sub="Aucune paie trouvée">Trésorerie jusqu'à la paie</PanelTitle>
        <p className="text-sm text-slate-600">
          Classe ton salaire dans la catégorie « {SALARY_CATEGORY} » (ou crée une <Link to="/regles" className="font-semibold underline">règle</Link> pour ton employeur) : la date de la prochaine paie sera déduite de l'historique.
        </p>
      </Panel>
    );
  return (
    <Panel className="mt-5" testid="treasury-card">
      <PanelTitle
        sub={
          <>
            Dernière paie le {fmtDate(t.lastPay.date)} ({money(t.lastPay.amount)}) · prochaine attendue au plus tard le <b>{fmtDate(t.nextPay)}</b>
            {t.late && <span className="ml-1 font-semibold text-amber-700">— pas encore saisie</span>}
          </>
        }
      >
        Trésorerie jusqu'à la paie
      </PanelTitle>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <Row label="Disponible aujourd'hui" hint="Compte principal + Pockets, hors épargne" value={t.available} />
          <Row label="Échéances prévues d'ici la paie" hint="Récurrences (prélèvements, CAF…)" value={t.planned} />
          <Row label="Dépenses courantes estimées" hint="Ton rythme des 3 derniers cycles de paie" value={-t.variable} />
          <Row strong label={t.carry < 0 ? "Il te manquera" : "Report estimé à la paie"} value={t.carry} />
        </div>
        <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-900">Depuis la dernière paie</p>
          <p className="mt-1 tabular">
            {money(t.since.inc)} entrés · {money(t.since.exp)} sortis
          </p>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Un salaire reçu fin de mois paie le mois suivant : les totaux « par mois » peuvent donc être négatifs alors que tes comptes ne le sont pas. Ce cycle, lui, va de paie à paie.
          </p>
        </div>
      </div>
    </Panel>
  );
}
