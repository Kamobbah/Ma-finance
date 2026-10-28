import { useSyncExternalStore } from "react";
import seedCsv from "@/data/releve-revolut.csv?raw";
import { syncGoalStatus } from "./goals";
import type { Account, AppData, Budget, Category, Goal, Prefs, Recurrence, Rule, Transaction } from "./types";
import { applyRules, DEFAULT_CATEGORIES, defaultRules } from "./rules";
import { parseRevolutStatement } from "./revolut";
import { processDue } from "./recurrence";
import { fromIso, round2, todayIso, toIso, uid } from "./format";

/* ---------------- IndexedDB (clé/valeur minimaliste) ---------------- */
const DB_NAME = "ma-finance";
const STORE = "kv";
const KEY = "data";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------------- Store ---------------- */
const EMPTY: AppData = { version: 1, budgets: [], dismissedSubscriptions: [], accounts: [], transactions: [], categories: DEFAULT_CATEGORIES, rules: [], recurrences: [], goals: [] };
let state: AppData = EMPTY;
let ready = false;
let lastSaved: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    idbSet(state)
      .then(() => {
        lastSaved = new Date().toISOString();
        emit();
      })
      .catch(() => {
        try {
          localStorage.setItem("ma-finance-data", JSON.stringify(state));
        } catch {
          /* quota */
        }
      });
  }, 250);
}

function set(next: AppData) {
  state = next;
  emit();
  persist();
}

export function update(fn: (d: AppData) => AppData) {
  set(fn(state));
}

export function useData(): AppData {
  return useSyncExternalStore(subscribe, () => state);
}
export function useReady(): boolean {
  return useSyncExternalStore(subscribe, () => ready);
}
export function useLastSaved(): string | null {
  return useSyncExternalStore(subscribe, () => lastSaved);
}
export const getData = () => state;

/* ---------------- Seed ---------------- */
function detectRecurrences(txs: Transaction[]): Recurrence[] {
  const today = todayIso();
  const specs: { match: RegExp; name: string; category: string; type: "income" | "expense" }[] = [
    { match: /free mobile/i, name: "Free Mobile", category: "Téléphone", type: "expense" },
    { match: /cofica bail/i, name: "Cofica Bail (LOA voiture)", category: "Voiture", type: "expense" },
    { match: /opteven/i, name: "Opteven Assurances", category: "Assurances", type: "expense" },
    { match: /avanssur/i, name: "Avanssur (assurance)", category: "Assurances", type: "expense" },
    { match: /CAF DE LA GIRONDE/i, name: "CAF de la Gironde", category: "Aides / CAF", type: "income" },
  ];
  const out: Recurrence[] = [];
  for (const sp of specs) {
    const list = txs.filter((t) => sp.match.test(t.description) && (sp.type === "income" ? t.amount > 0 : t.amount < 0)).sort((a, b) => a.date.localeCompare(b.date));
    if (list.length < 3) continue;
    const last = list[list.length - 1];
    const day = fromIso(last.date).getDate();
    const t = fromIso(today);
    let next = new Date(t.getFullYear(), t.getMonth(), Math.min(day, 28));
    if (toIso(next) <= today) next = new Date(t.getFullYear(), t.getMonth() + 1, Math.min(day, 28));
    out.push({
      id: uid(),
      name: sp.name,
      amount: round2(Math.abs(last.amount)),
      accountId: last.accountId,
      category: sp.category,
      type: sp.type,
      frequency: "monthly",
      interval: 1,
      intervalUnit: "months",
      startDate: toIso(next),
      nextDate: toIso(next),
      endMode: "never",
      status: "active",
      note: "Détectée automatiquement depuis l'historique 2026 — à vérifier.",
      occurrences: 0,
      cumulated: 0,
    });
  }
  return out;
}

/** v2 : relevé complet depuis l'ouverture du compte (2019 →). */
export const SEED_VERSION = 2;

const dupKey = (t: Transaction) => `${t.date}|${t.accountId}|${t.amount.toFixed(2)}|${t.description.toLowerCase().replace(/\s+/g, " ").trim()}`;

/** Remplace l'historique importé par le nouveau relevé en conservant tout ce que l'utilisateur a créé ou corrigé. */
function mergeWithNewSeed(old: AppData): AppData {
  const { accounts: seedAccounts, transactions } = parseRevolutStatement(seedCsv);
  const missingRules = defaultRules().filter((r) => !old.rules.some((o) => o.name === r.name));
  const rules = [...old.rules, ...missingRules];
  const categories = [...old.categories, ...DEFAULT_CATEGORIES.filter((c) => !old.categories.some((o) => o.name === c.name))];
  const accounts: Account[] = seedAccounts.map((a) => {
    const prev = old.accounts.find((o) => o.id === a.id);
    return prev ? { ...a, name: prev.name, color: prev.color, icon: prev.icon, goal: prev.goal, archived: a.archived || prev.archived } : a;
  });
  for (const o of old.accounts) if (!accounts.some((a) => a.id === o.id)) accounts.push(o);

  const corrections = new Map<string, Transaction>();
  for (const t of old.transactions) if (t.source === "import" && t.catStatus === "manual") corrections.set(dupKey(t), t);
  const imported = transactions.map((t) => {
    const fix = corrections.get(dupKey(t));
    return fix ? { ...t, category: fix.category, type: fix.type, internal: fix.internal, note: fix.note, catStatus: "manual" as const } : applyRules(t, rules);
  });
  const seen = new Map<string, number>();
  for (const t of imported) seen.set(dupKey(t), (seen.get(dupKey(t)) ?? 0) + 1);
  const kept = old.transactions.filter((t) => {
    if (t.source === "import") return false;
    const k = dupKey(t);
    const n = seen.get(k) ?? 0;
    if (n > 0) {
      seen.set(k, n - 1);
      return false; // saisie manuelle désormais présente dans le relevé
    }
    return true;
  });
  return { ...old, seedVersion: SEED_VERSION, accounts, rules, categories, transactions: [...imported, ...kept] };
}

export function buildSeed(): AppData {
  const { accounts, transactions } = parseRevolutStatement(seedCsv);
  const rules = defaultRules();
  const txs = transactions.map((t) => applyRules(t, rules));
  return { version: 1, seedVersion: SEED_VERSION, budgets: [], dismissedSubscriptions: [], accounts, transactions: txs, categories: DEFAULT_CATEGORIES, rules, recurrences: detectRecurrences(txs), goals: [] };
}

let createdOnBoot = 0;
let seedMigrated = false;
export const bootSeedMigrated = () => seedMigrated;
export const bootCreatedCount = () => createdOnBoot;

function runRecurrences(d: AppData): { data: AppData; created: number } {
  const created: Transaction[] = [];
  const recs = d.recurrences.map((r) => {
    const cur = d.accounts.find((a) => a.id === r.accountId)?.currency ?? "EUR";
    const res = processDue(r, cur);
    created.push(...res.created);
    return res.rec;
  });
  if (!created.length && recs.every((r, i) => r === d.recurrences[i])) return { data: d, created: 0 };
  return { data: { ...d, recurrences: recs, transactions: [...d.transactions, ...created] }, created: created.length };
}

export async function initStore() {
  let data: AppData | undefined;
  try {
    data = await idbGet<AppData>();
  } catch {
    const raw = localStorage.getItem("ma-finance-data");
    data = raw ? (JSON.parse(raw) as AppData) : undefined;
  }
  const first = !data;
  let migrated = false;
  if (!data) data = buildSeed();
  else if ((data.seedVersion ?? 1) < SEED_VERSION) {
    data = mergeWithNewSeed(data);
    migrated = true;
  }
  data = { ...EMPTY, ...data, budgets: data.budgets ?? [], dismissedSubscriptions: data.dismissedSubscriptions ?? [] };
  const res = runRecurrences(data);
  createdOnBoot = res.created;
  seedMigrated = migrated;
  state = res.data;
  ready = true;
  emit();
  if (first || migrated || res.created || res.data !== data) persist();
}

/* ---------------- Actions ---------------- */
export function addTransactions(txs: Transaction[], autoCategorize = true) {
  update((d) => ({ ...d, transactions: [...d.transactions, ...(autoCategorize ? txs.map((t) => applyRules(t, d.rules)) : txs)] }));
}

export function saveTransaction(tx: Transaction, autoCategorize: boolean) {
  update((d) => {
    const t = autoCategorize ? applyRules({ ...tx, catStatus: "to_review" }, d.rules) : tx;
    const exists = d.transactions.some((x) => x.id === t.id);
    return { ...d, transactions: exists ? d.transactions.map((x) => (x.id === t.id ? t : x)) : [...d.transactions, t] };
  });
}

export function deleteTransaction(id: string) {
  update((d) => ({ ...d, transactions: d.transactions.filter((t) => t.id !== id) }));
}

export function duplicateTransaction(id: string): Transaction | undefined {
  const src = state.transactions.find((t) => t.id === id);
  if (!src) return;
  const copy: Transaction = { ...src, id: uid(), source: "manual", recurrenceId: undefined, createdAt: new Date().toISOString(), description: src.description };
  update((d) => ({ ...d, transactions: [...d.transactions, copy] }));
  return copy;
}

export function reapplyRules(): number {
  let changed = 0;
  update((d) => ({
    ...d,
    transactions: d.transactions.map((t) => {
      const n = applyRules(t, d.rules);
      if (n.category !== t.category || n.type !== t.type) changed++;
      return n;
    }),
  }));
  return changed;
}

export function saveRule(rule: Rule) {
  update((d) => ({ ...d, rules: d.rules.some((r) => r.id === rule.id) ? d.rules.map((r) => (r.id === rule.id ? rule : r)) : [rule, ...d.rules] }));
}
export function deleteRule(id: string) {
  update((d) => ({ ...d, rules: d.rules.filter((r) => r.id !== id) }));
}
export function duplicateRule(id: string) {
  update((d) => {
    const i = d.rules.findIndex((r) => r.id === id);
    if (i < 0) return d;
    const copy: Rule = { ...d.rules[i], id: uid(), name: d.rules[i].name + " (copie)", conditions: d.rules[i].conditions.map((c) => ({ ...c, id: uid() })) };
    const rules = [...d.rules];
    rules.splice(i + 1, 0, copy);
    return { ...d, rules };
  });
}
export function moveRule(id: string, delta: number) {
  update((d) => {
    const i = d.rules.findIndex((r) => r.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= d.rules.length) return d;
    const rules = [...d.rules];
    [rules[i], rules[j]] = [rules[j], rules[i]];
    return { ...d, rules };
  });
}

export function saveRecurrence(rec: Recurrence): number {
  let created = 0;
  update((d) => {
    const recurrences = d.recurrences.some((r) => r.id === rec.id) ? d.recurrences.map((r) => (r.id === rec.id ? rec : r)) : [...d.recurrences, rec];
    const res = runRecurrences({ ...d, recurrences });
    created = res.created;
    return res.data;
  });
  return created;
}
export function deleteRecurrence(id: string) {
  update((d) => ({ ...d, recurrences: d.recurrences.filter((r) => r.id !== id) }));
}

export function saveGoal(goal: Goal) {
  update((d) => ({ ...d, goals: d.goals.some((g) => g.id === goal.id) ? d.goals.map((g) => (g.id === goal.id ? goal : g)) : [...d.goals, goal] }));
}
/** Enregistre plusieurs objectifs en une seule mise à jour (ex. transfert de fonds d'un objectif atteint). */
export function saveGoals(goals: Goal[]) {
  update((d) => {
    const ids = new Set(goals.map((g) => g.id));
    return { ...d, goals: [...d.goals.map((g) => goals.find((x) => x.id === g.id) ?? g), ...goals.filter((g) => !d.goals.some((x) => x.id === g.id) && ids.has(g.id))] };
  });
}
export function deleteGoal(id: string) {
  update((d) => ({ ...d, goals: d.goals.filter((g) => g.id !== id) }));
}
/** amounts: goalId -> montant (+ allouer / - désallouer) */
export function allocate(amounts: Record<string, number>) {
  const date = todayIso();
  update((d) => ({
    ...d,
    goals: d.goals.map((g) => {
      const a = amounts[g.id];
      if (!a) return g;
      const allocated = round2(Math.max(0, g.allocated + a));
      const delta = round2(allocated - g.allocated);
      return syncGoalStatus({ ...g, allocated, history: [...g.history, { date, amount: delta }] });
    }),
  }));
}

export function saveAccount(acc: Account) {
  update((d) => ({ ...d, accounts: d.accounts.some((a) => a.id === acc.id) ? d.accounts.map((a) => (a.id === acc.id ? acc : a)) : [...d.accounts, acc] }));
}
export function deleteAccount(id: string) {
  update((d) => ({ ...d, accounts: d.accounts.filter((a) => a.id !== id) }));
}

export function addCategory(cat: Category) {
  update((d) => (d.categories.some((c) => c.name.toLowerCase() === cat.name.toLowerCase()) ? d : { ...d, categories: [...d.categories, cat] }));
}

export function saveBudget(b: Budget) {
  update((d) => ({ ...d, budgets: d.budgets.some((x) => x.id === b.id) ? d.budgets.map((x) => (x.id === b.id ? b : x)) : [...d.budgets, b] }));
}
export function deleteBudget(id: string) {
  update((d) => ({ ...d, budgets: d.budgets.filter((b) => b.id !== id) }));
}
export function dismissSubscription(key: string) {
  update((d) => ({ ...d, dismissedSubscriptions: [...d.dismissedSubscriptions, key] }));
}
export function restoreSubscriptions() {
  update((d) => ({ ...d, dismissedSubscriptions: [] }));
}

export function replaceAll(data: AppData) {
  set(runRecurrences({ ...EMPTY, ...data, version: 1 }).data);
}
export function resetToSeed() {
  set(buildSeed());
}
export function clearAll() {
  set({ ...EMPTY, categories: DEFAULT_CATEGORIES, rules: defaultRules() });
}

/* ---------------- Préférences (localStorage) ---------------- */
const PREFS_KEY = "ma-finance-prefs";
function loadPrefs(): Prefs {
  const def: Prefs = { accountFilter: "all", year: new Date().getFullYear(), includeInternal: false };
  try {
    return { ...def, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>) };
  } catch {
    return def;
  }
}
let prefs: Prefs = loadPrefs();
const prefListeners = new Set<() => void>();
export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      prefListeners.add(l);
      return () => prefListeners.delete(l);
    },
    () => prefs,
  );
}
export const getPrefs = () => prefs;
export function setPrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch };
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  prefListeners.forEach((l) => l());
}
