import { useEffect } from "react";
import { toast } from "sonner";
import { BellRing, X } from "lucide-react";
import { setPrefs, useData, usePrefs } from "@/lib/store";
import { reminderLabel, upcomingReminders } from "@/lib/insights";
import { fmtDate, money } from "@/lib/format";
import { cn } from "@/lib/utils";

let toasted = false;

export default function RemindersBar() {
  const data = useData();
  const prefs = usePrefs();
  const dismissed = prefs.dismissedReminders ?? [];
  const all = upcomingReminders(data);
  const visible = all.filter((r) => !dismissed.includes(r.key));
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

  if (!visible.length) return null;
  const dismiss = (keys: string[]) => {
    // on ne garde que les clés encore pertinentes pour éviter une liste infinie
    const keep = dismissed.filter((k) => all.some((r) => r.key === k));
    setPrefs({ dismissedReminders: [...keep, ...keys] });
  };

  return (
    <div data-testid="reminders-bar" className="mb-6 rounded-3xl border border-cyan-200/70 bg-gradient-to-r from-cyan-50 to-white p-3 pl-4 shadow-[0_4px_20px_-10px_rgba(8,145,178,0.35)] animate-rise">
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
  );
}
