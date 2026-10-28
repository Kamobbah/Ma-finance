import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import AppShell from "@/components/AppShell";
import Dashboard from "@/pages/Dashboard";
import Operations from "@/pages/Operations";
import Annual from "@/pages/Annual";
import Years from "@/pages/Years";
import Savings from "@/pages/Savings";
import Recurrences from "@/pages/Recurrences";
import Rules from "@/pages/Rules";
import DataPage from "@/pages/Data";
import Budgets from "@/pages/Budgets";
import Accounts from "@/pages/Accounts";
import AccountDetail from "@/pages/AccountDetail";
import { bootCreatedCount, bootSeedMigrated, initStore, useReady } from "@/lib/store";

let booted = false;

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  const ready = useReady();
  const [bootError, setBootError] = useState(false);
  useEffect(() => {
    if (booted) return;
    booted = true;
    initStore().catch(() => setBootError(true)).then(() => {
      if (bootSeedMigrated())
        setTimeout(() => toast.success("Historique mis à jour", { description: "Le relevé complet depuis l'ouverture du compte a été chargé. Vos saisies, règles, budgets et objectifs sont conservés.", duration: 8000 }), 300);
      const n = bootCreatedCount();
      if (n) setTimeout(() => toast.success(`${n} opération(s) récurrente(s) créée(s) automatiquement`), 400);
    });
  }, []);

  if (!ready)
    return (
      <div data-testid="app-loading" className="grid min-h-screen place-items-center bg-background text-sm text-slate-500">
        <div className="flex items-center gap-3">
          <div className="grid size-9 animate-pulse place-items-center rounded-2xl bg-slate-900 font-extrabold text-white">€</div>
          {bootError ? "Impossible de joindre le serveur (backend ou MongoDB arrêté). Relancez-le puis rechargez la page." : "Chargement de vos données…"}
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
