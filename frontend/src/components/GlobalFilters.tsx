import { Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/kit";
import { setPrefs, useData, usePrefs } from "@/lib/store";
import { accountOptions, openTxDialog, yearOptions } from "@/lib/ui";

export function InternalToggle({ value, onChange, testid = "toggle-internal-transfers" }: { value: boolean; onChange: (v: boolean) => void; testid?: string }) {
  return (
    <label className="flex h-10 cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700">
      <Switch data-testid={testid} checked={value} onCheckedChange={(c) => onChange(!!c)} aria-label="Inclure les virements internes" />
      <span data-testid={`${testid}-label`}>{value ? "Inclure les virements internes" : "Dépenses et revenus réels uniquement"}</span>
    </label>
  );
}

export default function GlobalFilters({ showAdd = true }: { showAdd?: boolean }) {
  const data = useData();
  const prefs = usePrefs();
  return (
    <div data-testid="global-filters" className="mb-6 flex flex-wrap items-center gap-2 rounded-3xl border border-slate-200/60 bg-white/70 p-2 shadow-[0_2px_12px_-6px_rgba(15,23,42,0.08)] backdrop-blur animate-rise">
      <NativeSelect testid="filter-account-select" ariaLabel="Compte" value={prefs.accountFilter} onChange={(v) => setPrefs({ accountFilter: v })} options={accountOptions(data.accounts, true, true)} className="min-w-[200px] flex-1 sm:flex-none" />
      <NativeSelect testid="filter-year-select" ariaLabel="Année" value={String(prefs.year)} onChange={(v) => setPrefs({ year: Number(v) })} options={yearOptions(data)} />
      <InternalToggle value={prefs.includeInternal} onChange={(v) => setPrefs({ includeInternal: v })} />
      {showAdd && (
        <Button data-testid="add-transaction-button" className="ml-auto hidden h-10 rounded-xl px-4 active:scale-[0.98] transition-transform lg:inline-flex" onClick={() => openTxDialog()}>
          <Plus /> Ajouter une opération
        </Button>
      )}
    </div>
  );
}
