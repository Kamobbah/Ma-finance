import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { money, TYPE_LABELS } from "@/lib/format";
import type { CatStatus, TxSource, TxType } from "@/lib/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface Opt {
  value: string;
  label: string;
  group?: string;
}

export function NativeSelect({ value, onChange, options, testid, className, ariaLabel, placeholder }: { value: string; onChange: (v: string) => void; options: Opt[]; testid: string; className?: string; ariaLabel?: string; placeholder?: string }) {
  const groups: { name?: string; items: Opt[] }[] = [];
  for (const o of options) {
    const g = groups.find((x) => x.name === o.group);
    if (g) g.items.push(o);
    else groups.push({ name: o.group, items: [o] });
  }
  return (
    <select
      data-testid={testid}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-10 rounded-xl border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-800 outline-none transition-[border-color,box-shadow] focus:border-slate-400 focus:ring-3 focus:ring-slate-200 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2364748B%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:14px] bg-[right_10px_center] bg-no-repeat",
        className,
      )}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {groups.map((g, i) =>
        g.name ? (
          <optgroup key={g.name} label={g.name}>
            {g.items.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ) : (
          g.items.map((o) => (
            <option key={o.value + i} value={o.value}>
              {o.label}
            </option>
          ))
        ),
      )}
    </select>
  );
}

export function Panel({ children, className, testid }: { children: ReactNode; className?: string; testid?: string }) {
  return (
    <section data-testid={testid} className={cn("rounded-3xl border border-slate-200/60 bg-white p-5 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.06)] transition-shadow duration-200 hover:shadow-[0_10px_34px_-10px_rgba(15,23,42,0.10)] sm:p-6 animate-rise", className)}>
      {children}
    </section>
  );
}

export function PanelTitle({ children, aside, sub }: { children: ReactNode; aside?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-base font-bold tracking-tight text-slate-900">{children}</h3>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </div>
      {aside}
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-rise">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{eyebrow}</p>}
        <h1 data-testid="page-title" className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TONES = {
  income: "bg-[#EEF8F1] text-emerald-900",
  expense: "bg-[#FCF0EF] text-rose-900",
  net: "bg-[#EEF3FB] text-blue-950",
  savings: "bg-[#FBF5E8] text-amber-950",
  plain: "bg-white text-slate-900",
  dark: "bg-slate-900 text-white",
} as const;

export function StatCard({ label, value, tone = "plain", sub, testid, icon, children, className }: { label: string; value: string; tone?: keyof typeof TONES; sub?: ReactNode; testid: string; icon?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div data-testid={testid} className={cn("relative overflow-hidden rounded-3xl border border-slate-200/50 p-5 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.06)] transition-transform duration-200 hover:-translate-y-0.5 sm:p-6 animate-rise", TONES[tone], className)}>
      <div className="flex items-center justify-between">
        <p className={cn("text-xs font-semibold uppercase tracking-[0.14em]", tone === "dark" ? "text-slate-300" : "opacity-70")}>{label}</p>
        {icon && <span className={cn("grid size-9 place-items-center rounded-2xl", tone === "dark" ? "bg-white/10" : "bg-white/70")}>{icon}</span>}
      </div>
      <p data-testid={`${testid}-value`} className="mt-4 text-2xl font-extrabold tracking-tight tabular sm:text-[2rem] leading-none">
        {value}
      </p>
      {sub && <div className={cn("mt-2 text-xs", tone === "dark" ? "text-slate-300" : "opacity-75")}>{sub}</div>}
      {children}
    </div>
  );
}

export function Amount({ value, currency = "EUR", className, type }: { value: number; currency?: string; className?: string; type?: TxType }) {
  const transfer = type === "transfer_in" || type === "transfer_out";
  return <span className={cn("font-semibold tabular whitespace-nowrap", transfer ? "text-blue-700" : value > 0 ? "text-emerald-700" : value < 0 ? "text-slate-900" : "text-slate-500", className)}>{money(value, currency, true)}</span>;
}

const TYPE_STYLES: Record<TxType, string> = {
  income: "bg-emerald-50 text-emerald-800 ring-emerald-200/70",
  expense: "bg-rose-50 text-rose-800 ring-rose-200/70",
  transfer_in: "bg-blue-50 text-blue-800 ring-blue-200/70",
  transfer_out: "bg-indigo-50 text-indigo-800 ring-indigo-200/70",
};

export function Chip({ children, className, testid }: { children: ReactNode; className?: string; testid?: string }) {
  return (
    <span data-testid={testid} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap", className)}>
      {children}
    </span>
  );
}

export function TypeBadge({ type }: { type: TxType }) {
  return <Chip className={TYPE_STYLES[type]}>{TYPE_LABELS[type]}</Chip>;
}

export function SourceBadge({ source }: { source: TxSource }) {
  const map = { import: ["Importée", "bg-slate-50 text-slate-600 ring-slate-200"], manual: ["Manuelle", "bg-violet-50 text-violet-700 ring-violet-200"], recurring: ["Récurrence", "bg-cyan-50 text-cyan-800 ring-cyan-200"] } as const;
  return <Chip className={map[source][1]}>{map[source][0]}</Chip>;
}

export function CatStatusBadge({ status }: { status: CatStatus }) {
  const map = { auto: ["Auto", "bg-emerald-50 text-emerald-700 ring-emerald-200"], manual: ["Manuelle", "bg-slate-100 text-slate-700 ring-slate-200"], to_review: ["À vérifier", "bg-amber-50 text-amber-800 ring-amber-200"] } as const;
  return <Chip className={map[status][1]}>{map[status][0]}</Chip>;
}

export function EmptyState({ icon, title, text, action, testid }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode; testid?: string }) {
  return (
    <div data-testid={testid ?? "empty-state"} className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 text-center">
      {icon && <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-white text-slate-500 shadow-sm">{icon}</div>}
      <p className="font-semibold text-slate-800">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

export function ProgressBar({ value, color = "#10B981", testid }: { value: number; color?: string; testid?: string }) {
  return (
    <div data-testid={testid} className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, background: color }} />
    </div>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Supprimer",
  onConfirm,
  requireText,
  testid = "confirm-dialog",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  requireText?: string;
  testid?: string;
}) {
  const [typed, setTyped] = useState("");
  const ok = !requireText || typed.trim().toUpperCase() === requireText.toUpperCase();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setTyped("");
        onOpenChange(o);
      }}
    >
      <DialogContent data-testid={testid} className="sm:max-w-md rounded-3xl p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {requireText && (
          <Field label={`Tapez « ${requireText} » pour confirmer`}>
            <Input data-testid={`${testid}-input`} value={typed} onChange={(e) => setTyped(e.target.value)} className="h-10 rounded-xl" />
          </Field>
        )}
        <DialogFooter className="-mx-6 -mb-6 rounded-b-3xl px-6">
          <Button variant="outline" data-testid={`${testid}-cancel`} onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            data-testid={`${testid}-confirm`}
            disabled={!ok}
            onClick={() => {
              onConfirm();
              setTyped("");
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TooltipPayload {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string | number;
  payload?: { fill?: string };
}

export function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string | number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      {label !== undefined && <p className="mb-1 font-semibold text-slate-800">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="size-2 rounded-full" style={{ background: p.color ?? p.payload?.fill }} />
            {p.name}
          </span>
          <span className="font-semibold tabular text-slate-900">{money(Number(p.value ?? 0))}</span>
        </div>
      ))}
    </div>
  );
}

export const inputCls = "h-10 rounded-xl border-slate-200 bg-white";
