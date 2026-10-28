import type { Account, Transaction, TxType } from "./types";
import { parseAmount, parseCsv, parseDate } from "./csv";
import { round2 } from "./format";
import { INTERNAL_CATEGORY } from "./rules";

export const MAIN_ID = "acc-main";
export const SAVINGS_ID = "acc-savings";

const POCKET_COLORS = ["#F59E0B", "#8B5CF6", "#06B6D4", "#EC4899", "#10B981", "#6366F1", "#F97316", "#14B8A6"];

export function isRevolutStatement(text: string): boolean {
  return text.includes("Relevé des transactions") && text.includes("Revolut");
}

function slug(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function decodeHtml(s: string) {
  return s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

interface Built {
  accounts: Account[];
  transactions: Transaction[];
}

/**
 * Normalise un relevé Revolut multi-comptes (format export « Relevé de compte »).
 * Les catégories sont attribuées ensuite par le moteur de règles.
 */
export function parseRevolutStatement(text: string, existing: Account[] = []): Built {
  const rows = parseCsv(text, ",");
  const accounts = new Map<string, Account>();
  existing.forEach((a) => accounts.set(a.id, a));
  const byName = (name: string) => [...accounts.values()].find((a) => a.name.toLowerCase() === name.toLowerCase());
  let pocketIdx = existing.filter((a) => a.type === "pocket").length;

  const ensureAccount = (rawTitle: string): Account | null => {
    const m = rawTitle.trim().match(/^(.+?)\s*\((EUR|USD|JPY|GBP|CHF)\)$/);
    if (!m) return null;
    const name = m[1].trim();
    const currency = m[2];
    let acc: Account | undefined;
    if (name === "Compte personnel") {
      if (currency === "EUR") {
        acc = accounts.get(MAIN_ID) ?? { id: MAIN_ID, name: "Compte principal", type: "main", currency, openingBalance: 0, color: "#0F172A", icon: "wallet", archived: false };
      } else {
        const id = `acc-${currency.toLowerCase()}`;
        acc = accounts.get(id) ?? { id, name: `Compte ${currency}`, type: "other", currency, openingBalance: 0, color: "#64748B", icon: "globe", archived: false };
      }
    } else if (name.startsWith("Épargne") || name.startsWith("Epargne")) {
      acc = accounts.get(SAVINGS_ID) ?? { id: SAVINGS_ID, name: "Compte d'épargne", type: "savings", currency, openingBalance: 0, color: "#D97706", icon: "piggy", archived: false };
    } else {
      acc = byName(name) ?? {
        id: `pocket-${slug(name)}`,
        name,
        type: "pocket",
        currency,
        openingBalance: 0,
        color: POCKET_COLORS[pocketIdx++ % POCKET_COLORS.length],
        icon: "pocket",
        archived: false,
        parentId: MAIN_ID,
      };
    }
    accounts.set(acc.id, acc);
    return acc;
  };

  type Raw = { accountId: string; date: string; description: string; amount: number; balance: number | null; idx: number };
  const raws: Raw[] = [];
  const interest: Raw[] = [];
  let phase: "recap" | "tx" | "savings" = "recap";
  let current: Account | null = null;
  let savingsClosing: number | null = null;
  let savingsOpenDate: string | null = null;
  let recapAccount: Account | null = null;
  const closed = new Set<string>();

  rows.forEach((r, idx) => {
    const c0 = (r[0] ?? "").trim();
    if (c0 === "Comptes courants Relevés de transactions") phase = "tx";
    if (c0.startsWith("Comptes épargne Transaction")) phase = "savings";
    const isTitle = /\((EUR|USD|JPY|GBP|CHF)\)$/.test(c0) && r.slice(1).every((v) => !v);
    if (isTitle) {
      const acc = ensureAccount(c0);
      if (phase === "recap") recapAccount = acc;
      else current = acc;
      return;
    }
    if (phase === "recap") {
      if (recapAccount && r[2] === "Date de fermeture" && (r[3] ?? "").trim()) closed.add(recapAccount.id);
      if (recapAccount?.type === "savings") {
        if (r[2] === "Solde de clôture") savingsClosing = parseAmount(r[3]);
        if (r[2] === "Date d'ouverture") savingsOpenDate = parseDate(r[3]);
      }
      return;
    }
    const date = parseDate(c0);
    if (!date || !current) return;
    if (phase === "tx") {
      const amount = parseAmount(r[3]);
      if (amount === null) return;
      // comptes en devises : colonnes doublées (devise, EUR) → solde en colonne 5
      const balance = parseAmount(current.currency === "EUR" ? r[4] : r[5]);
      raws.push({ accountId: current.id, date, description: decodeHtml(r[1]).trim(), amount, balance, idx });
    } else {
      const net = parseAmount(r[7]);
      if (net === null || net === 0) return;
      interest.push({ accountId: SAVINGS_ID, date, description: decodeHtml(r[1]).trim(), amount: net, balance: null, idx });
    }
  });

  // Soldes d'ouverture (uniquement pour les comptes nouvellement créés)
  const seenOpening = new Set<string>();
  for (const raw of raws) {
    if (seenOpening.has(raw.accountId)) continue;
    seenOpening.add(raw.accountId);
    const acc = accounts.get(raw.accountId)!;
    if (!existing.some((e) => e.id === acc.id) && raw.balance !== null) acc.openingBalance = round2(raw.balance - raw.amount);
  }
  for (const id of closed) {
    const acc = accounts.get(id);
    if (acc && !existing.some((e) => e.id === id) && acc.type === "pocket") acc.archived = true;
  }

  const baseTime = Date.now();
  const txs: Transaction[] = [];
  const mk = (raw: Raw, type: TxType, internal: boolean, counterpart?: string, extra: Partial<Transaction> = {}): Transaction => ({
    id: crypto.randomUUID(),
    date: raw.date,
    accountId: raw.accountId,
    description: raw.description,
    category: internal ? INTERNAL_CATEGORY : "",
    type,
    amount: raw.amount,
    currency: accounts.get(raw.accountId)?.currency ?? "EUR",
    internal,
    counterpartAccountId: counterpart,
    source: "import",
    catStatus: "to_review",
    createdAt: new Date(baseTime + raw.idx).toISOString(),
    balance: raw.balance ?? undefined,
    ...extra,
  });
  const dirType = (a: number): TxType => (a >= 0 ? "transfer_in" : "transfer_out");
  const savingsAcc = ensureAccount("Épargne (EUR)")!;

  // Appariement des « Retrait depuis une Pocket » côté compte principal
  const pocketWithdrawals = raws.filter((x) => x.description === "Retrait depuis une Pocket" && x.accountId !== MAIN_ID);
  const used = new Set<Raw>();

  for (const raw of raws) {
    const acc = accounts.get(raw.accountId)!;
    const d = raw.description;
    const toPocket = d.match(/^Sur la Pocket EUR (.+) depuis EUR$/);
    if (toPocket) {
      const counterpart = acc.type === "main" ? byName(toPocket[1].trim())?.id : MAIN_ID;
      txs.push(mk(raw, dirType(raw.amount), true, counterpart));
    } else if (d === "Retrait depuis une Pocket") {
      let counterpart: string | undefined = MAIN_ID;
      if (acc.type === "main") {
        const match = pocketWithdrawals.find((p) => !used.has(p) && p.date === raw.date && Math.abs(p.amount + raw.amount) < 0.005);
        if (match) used.add(match);
        counterpart = match?.accountId;
      }
      txs.push(mk(raw, dirType(raw.amount), true, counterpart));
    } else if (acc.currency !== "EUR" && /^Change en /i.test(d)) {
      // conversion de devises côté compte en devise : mouvement interne avec le compte principal
      txs.push(mk(raw, dirType(raw.amount), true, MAIN_ID));
    } else if (/compte d'épargne/i.test(d)) {
      txs.push(mk(raw, dirType(raw.amount), true, savingsAcc.id));
      const mirror: Raw = { ...raw, accountId: savingsAcc.id, amount: -raw.amount, description: raw.amount < 0 ? `Depuis ${acc.name}` : `Vers ${acc.name}` };
      txs.push(mk(mirror, dirType(mirror.amount), true, acc.id));
    } else {
      txs.push(mk(raw, raw.amount >= 0 ? "income" : "expense", false));
    }
  }
  for (const raw of interest) txs.push(mk(raw, "income", false));

  // Rapprochement du compte d'épargne : le relevé ne détaille que les intérêts
  if (savingsClosing !== null) {
    const computed = round2(txs.filter((t) => t.accountId === savingsAcc.id).reduce((s, t) => s + t.amount, savingsAcc.openingBalance));
    const diff = round2(savingsClosing - computed);
    if (Math.abs(diff) >= 0.01) {
      const firstDate = savingsOpenDate ?? txs.filter((t) => t.accountId === savingsAcc.id).map((t) => t.date).sort()[0] ?? "2026-01-01";
      txs.push(
        mk({ accountId: savingsAcc.id, date: firstDate, description: "Ajustement de rapprochement (mouvements non détaillés)", amount: diff, balance: null, idx: -1 }, dirType(diff), true, undefined, {
          note: "Écart entre le solde de clôture du relevé et les mouvements connus (virements depuis d'autres sources non détaillés dans l'export).",
        }),
      );
    }
  }

  return { accounts: [...accounts.values()], transactions: txs };
}
