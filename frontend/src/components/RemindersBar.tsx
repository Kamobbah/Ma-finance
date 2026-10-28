import { useEffect } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { BellRing, TriangleAlert, X } from "lucide-react";
import { setPrefs, useData, usePrefs } from "@/lib/store";
import { LOW_BALANCE_DAYS, lowBalanceAlerts, reminderLabel, upcomingReminders } from "@/lib/insights";
import { fmtDate, money } from "@/lib/format";
import { cn } from "@/lib/utils";

let toasted = false;
let lowToasted = false;

export default function RemindersBar() {
  const data = useData();
  const prefs = usePrefs();
  const dismissed = prefs.dismissedReminders ?? [];
  const all = upcomingReminders(data);
  const lows = lowBalanceAlerts(data);
  const visible = all.filter((r) => !dismissed.includes(r.key));
  const visibleLows = lows.filter((l) => !dismissed.includes(l.key));
  const accName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? "";

  useEffect(() => {
    if (toasted || !visible.length) return;
    toasted = true;
    const today = visible.filter((r) => r.daysUntil === 0).length;
    setTimeout(
      () =>
        toast.info(`${visible.length} échéance${visible.length > 1 ? "s" : ""} à venir`, {
          description: today ? `${today} prélèvement(s) aujourd'hui` : "Dans les 3 prochains jours",
        }),
      600,
    );
  }, [visible]);

  useEffect(() => {
    if (lowToasted || !visibleLows.length) return;
    lowToasted = true;
    const l = visibleLows[0];
    setTimeout(
      () =>
        toast.warning(visibleLows.length > 1 ? `${visibleLows.length} Pockets manquent d'argent` : `Solde insuffisant sur « ${l.accountName} »`, {
          description: `Il manque ${money(l.shortfall)} pour l'échéance du ${fmtDate(l.firstShortDate)}`,
        }),
      900,
    );
  }, [visibleLows]);

  if (!visible.length && !visibleLows.length) return null;
  const dismiss = (keys: string[]) => {
    // on ne garde que les clés encore pertinentes pour éviter une liste infinie
    const keep = dismissed.filter((k) => all.some((r) => r.key === k) || lows.some((l) => l.key === k));
    setPrefs({ dismissedReminders: [...keep, ...keys] });
  };

  return (
    <div className="mb-6 space-y-3">
      {visibleLows.length > 0 && (
        <div data-testid="low-balance-bar" className="rounded-3xl border border-rose-200/80 bg-gradient-to-r from-rose-50 to-white p-3 pl-4 shadow-[0_4px_20px_-10px_rgba(225,29,72,0.35)] animate-rise">
          <p className="flex items-center gap-2 text-sm font-semibold text-rose-950">
            <TriangleAlert className="size-4 text-rose-600" /> Solde bas : échéances à couvrir dans les {LOW_BALANCE_DAYS} prochains jours
          </p>
          <ul className="mt-2 space-y-1.5">
            {visibleLows.map((l) => (
              <li key={l.key} data-testid="low-balance-item" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-white/80 px-3 py-2 text-xs text-slate-700 ring-1 ring-rose-100">
                <Link to={`/comptes/${l.accountId}`} data-testid="low-balance-account-link" className="font-bold text-slate-900 hover:underline">
                  {l.accountName}
                </Link>
                <span className="tabular">
                  Solde <b>{money(l.balance)}</b> pour <b>{money(l.due)}</b> d'échéances ({l.items.map((i) => `${i.name} le ${fmtDate(i.date)}`).join(", ")})
                </span>
                <span className="font-semibold tabular text-rose-700" data-testid="low-balance-shortfall">
                  Il manque {money(l.shortfall)} avant le {fmtDate(l.firstShortDate)}
                </span>
                <button aria-label="Masquer cette alerte" data-testid="low-balance-dismiss" onClick={() => dismiss([l.key])} className="ml-auto rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100">
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {visible.length > 0 && (
        <div data-testid="reminders-bar" className="rounded-3xl border border-cyan-200/70 bg-gradient-to-r from-cyan-50 to-white p-3 pl-4 shadow-[0_4px_20px_-10px_rgba(8,145,178,0.35)] animate-rise">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-cyan-950">
              <BellRing className="size-4 text-cyan-600" /> Rappels d'échéances
            </span>
            <div className="flex flex-1 flex-wrap gap-2">
              {visible.map((r) => (
                <span
                  key={r.key}
                  data-testid="reminder-item"
                  data-stage={r.stage}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl px-3 py-1.5 text-xs ring-1 ring-inset",
                    r.daysUntil === 0 ? "bg-rose-50 text-rose-900 ring-rose-200" : r.daysUntil === 1 ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-white text-slate-700 ring-slate-200",
                  )}
                >
                  <b className="font-bold">{reminderLabel(r)}</b>
                  <span>
                    {r.name} · <span className="font-semibold tabular">{money(r.amount, "EUR", true)}</span>
                  </span>
                  <span className="hidden text-[11px] opacity-70 sm:inline">
                    {fmtDate(r.date)} · {accName(r.accountId)}
                  </span>
                  <button aria-label="Masquer ce rappel" data-testid="reminder-dismiss" onClick={() => dismiss([r.key])} className="rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100">
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
            {visible.length > 1 && (
              <button data-testid="reminders-dismiss-all" onClick={() => dismiss(visible.map((r) => r.key))} className="text-xs font-medium text-cyan-800 hover:underline">
                Tout masquer
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
