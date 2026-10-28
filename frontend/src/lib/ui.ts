import { useSyncExternalStore } from "react";
import type { Account, AppData, Transaction } from "./types";
import type { Opt } from "@/components/kit";
import { ACCOUNT_TYPE_LABELS } from "./format";

/* Dialogue global d'ajout / édition de transaction */
interface TxDialogState {
  open: boolean;
  tx: Transaction | null;
}
let txDialog: TxDialogState = { open: false, tx: null };
const ls = new Set<() => void>();
export function useTxDialog() {
  return useSyncExternalStore(
    (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
    () => txDialog,
  );
}
export function openTxDialog(tx: Transaction | null = null) {
  txDialog = { open: true, tx };
  ls.forEach((l) => l());
}
export function closeTxDialog() {
  txDialog = { ...txDialog, open: false };
  ls.forEach((l) => l());
}

const GROUP_ORDER: Account["type"][] = ["main", "pocket", "savings", "other"];
const GROUP_NAMES = { main: "Compte principal", pocket: "Pockets", savings: "Épargne", other: "Autres devises" };

export function accountOptions(accounts: Account[], withAll = false, includeArchived = false): Opt[] {
  const out: Opt[] = [];
  if (withAll) {
    out.push({ value: "all", label: "Tous les comptes" });
    if (accounts.some((a) => a.type === "pocket")) out.push({ value: "pockets", label: "Toutes les Pockets" });
  }
  for (const t of GROUP_ORDER) {
    for (const a of accounts.filter((x) => x.type === t && (includeArchived || !x.archived))) {
      out.push({ value: a.id, label: `${a.name}${a.currency !== "EUR" ? ` (${a.currency})` : ""}${a.archived ? " — archivé" : ""}`, group: GROUP_NAMES[t] });
    }
  }
  return out;
}

export function accountTypeLabel(a: Account) {
  return ACCOUNT_TYPE_LABELS[a.type];
}

export function categoryOptions(data: AppData): Opt[] {
  return data.categories.map((c) => ({ value: c.name, label: c.name }));
}

export function yearOptions(data: AppData): Opt[] {
  const ys = new Set<number>([new Date().getFullYear()]);
  for (const t of data.transactions) ys.add(Number(t.date.slice(0, 4)));
  ys.add(Math.max(...ys) + 1);
  return [...ys].sort((a, b) => b - a).map((y) => ({ value: String(y), label: String(y) }));
}

/* Dialogue global « Bilan du mois » */
let recap: { open: boolean; mk: string } = { open: false, mk: "" };
const rl = new Set<() => void>();
export function useRecapDialog() {
  return useSyncExternalStore(
    (l) => {
      rl.add(l);
      return () => rl.delete(l);
    },
    () => recap,
  );
}
export function openRecap(mk: string) {
  recap = { open: true, mk };
  rl.forEach((l) => l());
}
export function closeRecap() {
  recap = { ...recap, open: false };
  rl.forEach((l) => l());
}
