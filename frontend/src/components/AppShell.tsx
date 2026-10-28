import { NavLink, Outlet } from "react-router-dom";
import { useState } from "react";
import { LayoutDashboard, ListOrdered, LineChart, PiggyBank, Repeat, Wand2, Database, Plus, Menu, ShieldCheck, Target, WalletCards, CalendarRange } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import TransactionDialog from "./TransactionDialog";
import RemindersBar from "./RemindersBar";
import MonthlyRecapDialog from "./MonthlyRecapDialog";
import { openTxDialog } from "@/lib/ui";
import { useData, useLastSaved } from "@/lib/store";
import { budgetStatuses } from "@/lib/budgets";
import { todayIso } from "@/lib/format";

export const NAV = [
  { to: "/", label: "Tableau de bord", icon: LayoutDashboard, id: "dashboard" },
  { to: "/operations", label: "Opérations", icon: ListOrdered, id: "operations" },
  { to: "/comptes", label: "Comptes & Pockets", icon: WalletCards, id: "comptes" },
  { to: "/analyse", label: "Analyse annuelle", icon: LineChart, id: "analyse" },
  { to: "/bilan", label: "Bilan annuel", icon: CalendarRange, id: "bilan" },
  { to: "/budgets", label: "Budgets", icon: Target, id: "budgets" },
  { to: "/epargne", label: "Épargne", icon: PiggyBank, id: "epargne" },
  { to: "/recurrences", label: "Récurrences", icon: Repeat, id: "recurrences" },
  { to: "/regles", label: "Règles", icon: Wand2, id: "regles" },
  { to: "/donnees", label: "Données", icon: Database, id: "donnees" },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-9 place-items-center rounded-2xl bg-slate-900 text-white shadow-sm">
        <span className="text-sm font-extrabold">€</span>
      </div>
      <div className="leading-tight">
        <p className="text-[15px] font-extrabold tracking-tight text-slate-900">Ma Finance</p>
        <p className="text-[11px] text-slate-500">Comptes personnels</p>
      </div>
    </div>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const data = useData();
  const alerts = budgetStatuses(data, todayIso().slice(0, 7)).filter((s) => s.level !== "ok");
  const over = alerts.some((a) => a.level === "over");
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.to === "/"}
          onClick={onNavigate}
          data-testid={`nav-${n.id}`}
          className={({ isActive }) =>
            cn(
              "group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-[background-color,color] duration-150",
              isActive ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )
          }
        >
          <n.icon className="size-[18px]" />
          {n.label}
          {n.id === "budgets" && alerts.length > 0 && (
            <span data-testid="nav-budget-alerts" className={cn("ml-auto grid min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-bold text-white", over ? "bg-rose-500" : "bg-amber-500")}>
              {alerts.length}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function SavedHint() {
  const saved = useLastSaved();
  return (
    <div data-testid="local-storage-hint" className="rounded-2xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
      <p className="flex items-center gap-1.5 font-semibold text-slate-700">
        <ShieldCheck className="size-3.5 text-emerald-600" /> Données dans MongoDB
      </p>
      <p className="mt-1">Enregistrées par le serveur local. {saved ? `Sauvegardé à ${new Date(saved).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.` : "Sauvegarde automatique."}</p>
    </div>
  );
}

export default function AppShell() {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-8 border-r border-slate-200/70 bg-white/80 px-4 py-6 backdrop-blur-xl lg:flex">
        <div className="px-2">
          <Logo />
        </div>
        <NavItems />
        <div className="mt-auto">
          <SavedHint />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/70 bg-white/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Logo />
        <div className="flex items-center gap-2">
          <Button size="icon" data-testid="mobile-add-transaction-button" aria-label="Ajouter une opération" onClick={() => openTxDialog()}>
            <Plus />
          </Button>
          <Button size="icon" variant="outline" data-testid="mobile-menu-button" aria-label="Menu" onClick={() => setOpen(true)}>
            <Menu />
          </Button>
        </div>
      </header>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-5">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="mb-6">
            <Logo />
          </div>
          <NavItems onNavigate={() => setOpen(false)} />
          <div className="mt-6">
            <SavedHint />
          </div>
        </SheetContent>
      </Sheet>

      <main className="lg:pl-64">
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <RemindersBar />
          <Outlet />
        </div>
      </main>
      <TransactionDialog />
      <MonthlyRecapDialog />
    </div>
  );
}
