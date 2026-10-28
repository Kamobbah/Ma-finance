import type { TxType } from "./types";

const fmtCache = new Map<string, Intl.NumberFormat>();
export function money(v: number, currency = "EUR", signed = false): string {
  const key = currency + signed;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      signDisplay: signed ? "exceptZero" : "auto",
    });
    fmtCache.set(key, f);
  }
  return f.format(Math.round(v * 100) / 100 + 0);
}

export function compact(v: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v) + " €";
}

export const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
export const MONTHS_LONG = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export function fmtDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function todayIso(): string {
  const d = new Date();
  return toIso(d);
}

export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const TYPE_LABELS: Record<TxType, string> = {
  income: "Revenu",
  expense: "Dépense",
  transfer_in: "Transfert entrant",
  transfer_out: "Transfert sortant",
};

export const ACCOUNT_TYPE_LABELS = {
  main: "Compte principal",
  pocket: "Pocket",
  savings: "Épargne",
  other: "Autre",
} as const;

export function uid(): string {
  return crypto.randomUUID();
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
