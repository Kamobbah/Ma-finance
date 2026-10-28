import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import AppShell from "@/components/AppShell";
import Dashboard from "@/pages/Dashboard";
import Operations from "@/pages/Operations";
import Annual from "@/pages/Annual";
import Years from "@/pages/Years";
import Cashflow from "@/pages/Cashflow";
import Savings from "@/pages/Savings";
import Recurrences from "@/pages/Recurrences";
import Rules from "@/pages/Rules";
import DataPage from "@/pages/Data";
import Budgets from "@/pages/Budgets";
import Accounts from "@/pages/Accounts";
import AccountDetail from "@/pages/AccountDetail";
import { autoBackup, bootCreatedCount, bootSeedMigrated, initStore, useReady } from "@/lib/store";
import { runAutoBudgetPrep } from "@/lib/budgetPrep";
import { MONTHS_LONG } from "@/lib/format";

let booted = false;

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  const ready = useReady();
  useEffect(() => {
    if (booted) return;
    booted = true;
    initStore().then(() => {
      if (bootSeedMigrated())
        setTimeout(() => toast.success("Historique mis à jour", { description: "Le relevé complet depuis l'ouverture du compte a été chargé. Vos saisies, règles, budgets et objectifs sont conservés.", duration: 8000 }), 300);
      const n = bootCreatedCount();
      if (n) setTimeout(() => toast.success(`${n} opération(s) récurrente(s) créée(s) automatiquement`), 400);
      autoBackup().catch(() => undefined);
      const prepared = runAutoBudgetPrep();
      if (prepared) setTimeout(() => toast.info(`Budgets de ${MONTHS_LONG[Number(prepared.slice(5)) - 1].toLowerCase()} préparés`, { description: "Vérifiez les plafonds puis validez-les depuis le rappel" }), 700);
    });
  }, []);

  if (!ready)
    return (
      <div data-testid="app-loading" className="grid min-h-screen place-items-center bg-background text-sm text-slate-500">
        <div className="flex items-center gap-3">
          <div className="grid size-9 animate-pulse place-items-center rounded-2xl bg-slate-900 font-extrabold text-white">€</div>
          Chargement de vos données locales…
        </div>
      </div>
    );

  return (
    <>
    <Toaster richColors />
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/operations" element={<Operations />} />
        <Route path="/comptes" element={<Accounts />} />
        <Route path="/comptes/:id" element={<AccountDetail />} />
        <Route path="/analyse" element={<Annual />} />
        <Route path="/bilan" element={<Years />} />
        <Route path="/tresorerie" element={<Cashflow />} />
        <Route path="/budgets" element={<Budgets />} />
        <Route path="/epargne" element={<Savings />} />
        <Route path="/recurrences" element={<Recurrences />} />
        <Route path="/regles" element={<Rules />} />
        <Route path="/donnees" element={<DataPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </>
  );
}
