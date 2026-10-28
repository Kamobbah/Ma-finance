import type { Category, Rule, RuleCondition, Transaction, TxType } from "./types";
import { uid } from "./format";

export const UNCATEGORIZED = "Non classé";
export const INTERNAL_CATEGORY = "Virements internes";

export const DEFAULT_CATEGORIES: Category[] = [
  { name: "Salaire", color: "#10B981" },
  { name: "Aides / CAF", color: "#14B8A6" },
  { name: "Virements reçus", color: "#22C55E" },
  { name: "Rechargements", color: "#84CC16" },
  { name: "Remboursements", color: "#06B6D4" },
  { name: "Intérêts", color: "#0EA5E9" },
  { name: "Courses", color: "#F43F5E" },
  { name: "Restaurants / livraison", color: "#F97316" },
  { name: "Téléphone", color: "#8B5CF6" },
  { name: "Voiture", color: "#3B82F6" },
  { name: "Assurances", color: "#6366F1" },
  { name: "Transports", color: "#0891B2" },
  { name: "Stationnement", color: "#64748B" },
  { name: "Shopping", color: "#EC4899" },
  { name: "Abonnements & numérique", color: "#A855F7" },
  { name: "Loisirs", color: "#F59E0B" },
  { name: "Santé", color: "#EF4444" },
  { name: "Frais bancaires", color: "#78716C" },
  { name: "Retraits d'espèces", color: "#A16207" },
  { name: "Crédit", color: "#B91C1C" },
  { name: "Investissement", color: "#0F766E" },
  { name: "Change de devises", color: "#0D9488" },
  { name: "Arrondis RevPoints", color: "#D946EF" },
  { name: "Virements envoyés", color: "#E11D48" },
  { name: INTERNAL_CATEGORY, color: "#94A3B8" },
  { name: "Autres", color: "#9CA3AF" },
  { name: UNCATEGORIZED, color: "#CBD5E1" },
];

const desc = (op: "contains" | "startsWith" | "equals" | "regex", value: string): RuleCondition => ({ id: uid(), field: "description", op, value });
const dir = (value: "in" | "out"): RuleCondition => ({ id: uid(), field: "direction", value });

function r(name: string, conditions: RuleCondition[], category: string, setType?: TxType): Rule {
  return { id: uid(), name, enabled: true, conditions, category, setType };
}

export function defaultRules(): Rule[] {
  return [
    r("Salaire (paie)", [desc("regex", "\\bpaie\\b"), dir("in")], "Salaire", "income"),
    r("Salaire ALDI", [desc("contains", "ALDI MARCHE"), dir("in")], "Salaire", "income"),
    r("ALDI", [desc("contains", "ALDI"), dir("out")], "Courses", "expense"),
    r("Uber Eats", [desc("contains", "Uber Eats"), dir("out")], "Restaurants / livraison", "expense"),
    r("Free Mobile", [desc("contains", "Free Mobile"), dir("out")], "Téléphone", "expense"),
    r("Cofica Bail", [desc("contains", "Cofica Bail"), dir("out")], "Voiture", "expense"),
    r("CAF de la Gironde", [desc("contains", "CAF DE LA GIRONDE"), dir("in")], "Aides / CAF", "income"),
    r("Virements vers les Pockets", [desc("startsWith", "Sur la Pocket")], INTERNAL_CATEGORY),
    r("Retraits depuis une Pocket", [desc("equals", "Retrait depuis une Pocket")], INTERNAL_CATEGORY),
    r("Mouvements compte d'épargne", [desc("contains", "Compte d'épargne"), { id: uid(), field: "type", value: "transfer_in" }], INTERNAL_CATEGORY),
    r("Mouvements compte d'épargne (sortants)", [desc("contains", "Compte d'épargne"), { id: uid(), field: "type", value: "transfer_out" }], INTERNAL_CATEGORY),
    r("Intérêts d'épargne", [desc("startsWith", "Intérêts nets"), dir("in")], "Intérêts", "income"),
    r("Compte d'investissement", [desc("contains", "compte d'investissement"), dir("out")], "Investissement", "expense"),
    r("Change de devises", [desc("startsWith", "Change en ")], "Change de devises"),
    r("Arrondis RevPoints", [desc("contains", "RevPoints")], "Arrondis RevPoints", "expense"),
    r("Remboursement Uber Eats", [desc("contains", "Uber Eats"), dir("in")], "Remboursements", "income"),
    r("Supermarchés", [desc("regex", "carrefour|monoprix|magasin u|march[ée]s des bassins|indian shop|kbs store")], "Courses"),
    r("Restaurants", [desc("regex", "mcdonald|o'tacos|buffalo grill|scala pizza|restaura|bibibap|mam mam|akiba|mitsuba|la mie c[âa]line|caf[ée]|saines saveurs|fabrique givree|pub|the connemara|dog and duck|hms victory|bar")], "Restaurants / livraison"),
    r("Assurances", [desc("regex", "opteven|avanssur|acm iard")], "Assurances"),
    r("Transports", [desc("regex", "keolis|sncf|mobilit[ée]s|uber payments|^uber$|avia|aeroport")], "Transports"),
    r("Stationnement", [desc("regex", "metpark|horodateur|parking|r[ée]gie commun|mtpk|webamende")], "Stationnement"),
    r("Shopping", [desc("regex", "amazon|uniqlo|pull&bear|h&m|decathlon|sephora|pop mart|joybuy|relay|optique")], "Shopping"),
    r("Abonnements & numérique", [desc("regex", "anthropic|ionos|hetzner|apple|playstation|^free$")], "Abonnements & numérique"),
    r("Loisirs", [desc("regex", "ugc|megarama|bowling|golf|concert|fever|jazz|l'unite")], "Loisirs"),
    r("Frais bancaires", [desc("regex", "^frais d")], "Frais bancaires"),
    r("Retraits d'espèces", [desc("startsWith", "Retrait d'espèces")], "Retraits d'espèces"),
    r("Crédit Cofidis", [desc("contains", "Cofidis")], "Crédit"),
    r("Rechargements", [desc("equals", "Recharge"), dir("in")], "Rechargements", "income"),
    r("Virements reçus", [desc("regex", "^paiement envoy[ée] par|^payment from"), dir("in")], "Virements reçus", "income"),
    r("Virements envoyés", [desc("regex", "^to |^virement à"), dir("out")], "Virements envoyés", "expense"),
  ];
}

function textMatch(op: string, hay: string, needle: string): boolean {
  const h = hay.toLowerCase();
  const n = needle.toLowerCase();
  switch (op) {
    case "contains":
      return h.includes(n);
    case "startsWith":
      return h.startsWith(n);
    case "endsWith":
      return h.endsWith(n);
    case "equals":
      return h.trim() === n.trim();
    case "regex":
      try {
        return new RegExp(needle, "i").test(hay);
      } catch {
        return false;
      }
  }
  return false;
}

export function conditionMatches(c: RuleCondition, tx: Transaction): boolean {
  switch (c.field) {
    case "description":
      return textMatch(c.op, tx.description, c.value);
    case "amount": {
      const a = Math.abs(tx.amount);
      if (c.op === "eq") return Math.abs(a - c.value) < 0.005;
      if (c.op === "gt") return a > c.value;
      if (c.op === "lt") return a < c.value;
      return a >= c.value && a <= (c.value2 ?? c.value);
    }
    case "direction":
      return c.value === "in" ? tx.amount > 0 : tx.amount < 0;
    case "type":
      return tx.type === c.value;
    case "account":
      return tx.accountId === c.value;
    case "date":
      return (!c.from || tx.date >= c.from) && (!c.to || tx.date <= c.to);
    case "category":
      return tx.category === c.value;
  }
}

export function ruleMatches(rule: Rule, tx: Transaction): boolean {
  return rule.conditions.length > 0 && rule.conditions.every((c) => conditionMatches(c, tx));
}

/** Applique la première règle active correspondante (les catégories manuelles sont préservées). */
export function applyRules(tx: Transaction, rules: Rule[]): Transaction {
  if (tx.catStatus === "manual") return tx;
  const rule = rules.find((rl) => rl.enabled && ruleMatches(rl, tx));
  if (!rule) {
    if (tx.internal) return { ...tx, category: INTERNAL_CATEGORY, catStatus: "auto", ruleId: undefined };
    return { ...tx, category: UNCATEGORIZED, catStatus: "to_review", ruleId: undefined };
  }
  const type = rule.setType ?? tx.type;
  return {
    ...tx,
    category: rule.category,
    catStatus: "auto",
    ruleId: rule.id,
    type,
    internal: type === "transfer_in" || type === "transfer_out" ? true : rule.setType ? false : tx.internal,
  };
}

export function describeCondition(c: RuleCondition, accountName: (id: string) => string): string {
  const ops: Record<string, string> = { contains: "contient", startsWith: "commence par", endsWith: "se termine par", equals: "est exactement", regex: "correspond à l'expression" };
  switch (c.field) {
    case "description":
      return `Description ${ops[c.op]} « ${c.value} »`;
    case "amount":
      if (c.op === "between") return `Montant entre ${c.value} € et ${c.value2 ?? c.value} €`;
      return `Montant ${c.op === "eq" ? "égal à" : c.op === "gt" ? "supérieur à" : "inférieur à"} ${c.value} €`;
    case "direction":
      return c.value === "in" ? "Montant entrant" : "Montant sortant";
    case "type":
      return `Type : ${{ income: "revenu", expense: "dépense", transfer_in: "transfert entrant", transfer_out: "transfert sortant" }[c.value]}`;
    case "account":
      return `Compte : ${accountName(c.value)}`;
    case "date":
      return `Date entre ${c.from || "…"} et ${c.to || "…"}`;
    case "category":
      return `Catégorie actuelle : ${c.value}`;
  }
}
