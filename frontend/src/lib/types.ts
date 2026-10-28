export type AccountType = "main" | "pocket" | "savings" | "other";
export type TxType = "income" | "expense" | "transfer_in" | "transfer_out";
export type TxSource = "import" | "manual" | "recurring";
export type CatStatus = "auto" | "manual" | "to_review";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: number;
  color: string;
  icon?: string;
  archived: boolean;
  parentId?: string;
  goal?: PocketGoal;
}

export interface PocketGoal {
  target: number;
  targetDate?: string;
  label?: string;
}

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  accountId: string;
  description: string;
  category: string;
  type: TxType;
  amount: number; // signé : positif = entrant
  currency: string;
  note?: string;
  internal: boolean;
  counterpartAccountId?: string;
  source: TxSource;
  catStatus: CatStatus;
  ruleId?: string;
  recurrenceId?: string;
  createdAt: string;
  tags?: string[];
  attachments?: Attachment[];
  importId?: string; // lot d'import d'origine
  balance?: number; // solde indiqué par le relevé après l'opération
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string; // /api/attachments/<id> (anciennes pièces : data: URL)
}

export interface ImportBatch {
  id: string;
  fileName: string;
  at: string;
  format: "revolut" | "csv" | "xlsx";
  added: number;
  duplicates: number;
  errors: number;
  review: number;
  accountIds: string[];
  status: "active" | "cancelled";
  reconciliation: { accountId: string; statement: number; computed: number; diff: number; firstMismatch?: string }[];
}

export interface TrashItem {
  id: string;
  kind: "transaction" | "goal" | "recurrence" | "budget";
  label: string;
  deletedAt: string;
  item: Transaction | Goal | Recurrence | Budget;
}

export interface SavedFilter {
  id: string;
  name: string;
  query: string;
  account?: string;
  category?: string;
  year?: string;
  tag?: string;
  kind?: string;
}

export interface Category {
  name: string;
  color: string;
}

export type TextOp = "contains" | "startsWith" | "endsWith" | "equals" | "regex";
export type AmountOp = "eq" | "gt" | "lt" | "between";

export type RuleCondition =
  | { id: string; field: "description"; op: TextOp; value: string }
  | { id: string; field: "amount"; op: AmountOp; value: number; value2?: number }
  | { id: string; field: "direction"; value: "in" | "out" }
  | { id: string; field: "type"; value: TxType }
  | { id: string; field: "account"; value: string }
  | { id: string; field: "date"; from?: string; to?: string }
  | { id: string; field: "category"; value: string };

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: RuleCondition[];
  category: string;
  setType?: TxType;
  match?: "all" | "any"; // toutes les conditions (ET, défaut) ou au moins une (OU)
}

export type Frequency = "daily" | "weekly" | "monthly" | "yearly" | "custom";
export type EndMode = "never" | "date" | "count" | "amount";
export type RecurrenceStatus = "active" | "paused" | "ended";

export interface Recurrence {
  id: string;
  name: string;
  amount: number; // positif
  accountId: string;
  category: string;
  type: "income" | "expense" | "transfer"; // transfer : virement automatique accountId → toAccountId
  toAccountId?: string;
  frequency: Frequency;
  interval: number; // pour custom
  intervalUnit: "days" | "weeks" | "months";
  startDate: string;
  nextDate: string;
  endMode: EndMode;
  endDate?: string;
  maxCount?: number;
  targetAmount?: number;
  status: RecurrenceStatus;
  note?: string;
  occurrences: number;
  cumulated: number;
  manual?: boolean; // validation manuelle : pas de création automatique, l'échéance passe « en retard » si non validée
  skips?: string[]; // dates d'échéance sautées (pause d'un mois)
  amountOverrides?: Record<string, number>; // montant exceptionnel pour une échéance donnée
}

export type GoalStatus = "active" | "reached" | "paused" | "abandoned" | "archived";
export type GoalKind = "target" | "open" | "monthly" | "debt";
export type GoalPriority = "essential" | "important" | "bonus";

export interface GoalMove {
  date: string;
  amount: number; // + allocation, - désallocation
  source?: string; // compte / Pocket d'où vient l'argent
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  allocated: number;
  targetDate?: string;
  color: string;
  icon: string;
  status: GoalStatus;
  kind?: GoalKind; // défaut "target" (objectifs existants)
  monthly?: number; // versement mensuel prévu (€)
  minimum?: number; // montant minimum souhaité (objectifs sans cible)
  priority?: GoalPriority; // défaut "important"
  accountId?: string; // compte / Pocket lié
  archivedAt?: string;
  reachedAck?: boolean; // objectif atteint : l'utilisateur a choisi de conserver les fonds
  history: GoalMove[];
  createdAt: string;
}

export interface Budget {
  id: string;
  category: string; // "" = toutes les catégories (budget de compte)
  accountId?: string; // budget limité à un compte / une Pocket
  amount: number; // plafond mensuel par défaut
  overrides: Record<string, number>; // "YYYY-MM" -> plafond spécifique
  rollover?: boolean; // reporter le reste positif sur le mois suivant
  startMonth?: string; // "YYYY-MM" : premier mois du budget (départ du report)
}

export interface AppData {
  version: 1;
  seedVersion?: number;
  budgets: Budget[];
  dismissedSubscriptions: string[];
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  rules: Rule[];
  recurrences: Recurrence[];
  goals: Goal[];
  imports?: ImportBatch[];
  trash?: TrashItem[];
  savedFilters?: SavedFilter[];
  tags?: string[]; // étiquettes globales
  rulesVersion?: number;
}

export interface Prefs {
  accountFilter: string; // "all" | "pockets" | accountId
  year: number;
  includeInternal: boolean;
  lastRecapSeen?: string; // "YYYY-MM" du dernier bilan affiché
  dismissedReminders?: string[];
  autoBudgetPrep?: boolean;
  cashScope?: string; // périmètre de la trésorerie prévisionnelle
  cashVariable?: Record<string, number>; // dépenses variables mensuelles saisies, par périmètre
  cashIncludeVariable?: boolean;
  cashGoalSavings?: boolean;
  theme?: "light" | "dark";
  density?: "comfortable" | "compact";
  lastExportReminder?: string; // préparation auto des budgets du mois suivant (défaut : activée)
  budgetPrep?: Record<string, BudgetPrep>; // clé : mois préparé "YYYY-MM"
}

export interface BudgetPrep {
  from: string; // mois copié
  at: string; // date de préparation
  status: "pending" | "validated" | "cancelled";
  changes: { id: string; prev: number | null; value: number }[]; // prev : ajustement précédent (null = plafond par défaut)
  kept: number; // budgets déjà ajustés à la main, laissés tels quels
}
