# Ma Finance

Application de suivi de finances personnelles, en français, **100 % locale** : aucune inscription, aucun serveur, aucune base de données distante. Toutes les données restent dans le navigateur de l'appareil (`localStorage`) et peuvent être exportées / réimportées à tout moment.

Pensée pour un usage Revolut (compte principal, Pockets, compte d'épargne, comptes en devises), elle fonctionne avec n'importe quel relevé CSV.

---

## Fonctionnalités

### Suivi des comptes
- **Multi-comptes** : compte principal, Pockets, compte d'épargne, comptes en devises (USD, JPY…).
- **Soldes consolidés** et historique du solde de chaque compte / Pocket.
- **Virements internes** (compte ↔ Pockets ↔ épargne) exclus par défaut des revenus et dépenses réels, mais visibles compte par compte.
- **Page détail par compte** : courbe du solde, transferts entrants / sortants, dépenses par catégorie, budget du compte, objectif de Pocket (tirelire avec jauge).

### Opérations
- Recherche, filtres (compte, catégorie, type, période), ajout / modification / duplication / suppression.
- **Règles de catégorisation** automatiques et ordonnées, proposées lorsqu'on corrige une catégorie.
- **Import CSV** (relevés Revolut ou format générique) avec aperçu, et export CSV / JSON.

### Analyses
- **Tableau de bord** : indicateurs du mois, répartition par catégorie, dernières opérations, échéances à venir.
- **Analyse annuelle** : revenus, dépenses, résultat net mois par mois, comparaison avec l'année précédente.
- **Bilan annuel** : résumé de chaque année depuis la première opération (revenus, dépenses, taux d'épargne, épargne, grandes tendances) et **comparaison des années superposées** mois par mois.
- **Bilan du mois** : fenêtre automatique en début de mois (budgets tenus, Pockets alimentées, épargne).

### Budgets
- Plafond mensuel **par catégorie**, **par compte / Pocket**, ou par catégorie sur un compte.
- Alertes à 80 % puis au dépassement, ajustement mois par mois, vue annuelle.
- **Report automatique** du reste positif non dépensé sur le mois suivant.
- **Préparer le mois suivant** en copiant les plafonds du mois en cours.

### Récurrences et rappels
- Abonnements, prélèvements, salaires : échéances générées automatiquement et intégrées au prévisionnel.
- **Détecteur d'abonnements** : repère les dépenses au montant stable chaque mois et les transforme en récurrence en un clic.
- **Rappels d'échéances** dans l'application (3 jours avant, la veille, le jour même).
- **Alerte de solde bas** : prévient quand une Pocket ne couvre pas ses prélèvements des 7 prochains jours.

### Épargne et objectifs
- Le compte d'épargne réel est **réparti virtuellement** entre plusieurs objectifs (sans créer de faux solde).
- Trois types d'objectif : **cible** (montant à atteindre, date facultative), **ouvert** (sans montant final, avec minimum souhaité facultatif), **mensuel** (versement régulier).
- Priorités (Essentiel / Important / Bonus), mensuel prévu, mensuel requis, projection de fin d'année, date d'atteinte estimée.
- **Répartition d'un versement** : manuelle, à parts égales, au prorata du restant, selon le besoin mensuel, ou **suggestion automatique** par priorité.
- Objectif atteint 🎯 : conserver, archiver, libérer les fonds, renouveler ou créer un nouvel objectif avec les fonds.

---

## Confidentialité

- Aucune donnée ne quitte l'appareil : pas de compte, pas de serveur, pas de traçage.
- Les données sont stockées dans le `localStorage` du navigateur. Pensez à **exporter une sauvegarde** (page *Données*) avant de changer de navigateur ou de vider le cache.

> ⚠️ Le relevé utilisé pour l'initialisation (`frontend/src/data/`) contient des données bancaires personnelles. Si le dépôt est public, remplacez-le par un fichier d'exemple ou passez le dépôt en privé.

---

## Stack technique

- **React 19** + **TypeScript** (strict) + **Vite**
- **Tailwind CSS v4** + composants **shadcn/ui**
- **Recharts** pour les graphiques, **sonner** pour les notifications
- **React Router** pour la navigation

Le dossier `backend/` (FastAPI) provient du modèle de projet et n'est **pas utilisé** par l'application : tout fonctionne côté navigateur.

---

## Démarrer en local

Prérequis : Node.js 20+ et Yarn.

```bash
cd frontend
yarn install
yarn dev        # http://localhost:3000
```

Autres commandes :

```bash
yarn build      # build de production dans frontend/dist
yarn typecheck  # vérification TypeScript
yarn lint       # lint (oxlint)
```

Le build (`frontend/dist`) est un site statique : il peut être hébergé sur n'importe quel hébergeur statique (GitHub Pages, Netlify, Vercel…).

---

## Structure

```
frontend/src/
├── pages/          # Tableau de bord, Opérations, Comptes, Analyse, Bilan annuel,
│                   # Budgets, Épargne, Récurrences, Règles, Données
├── components/     # Coque de l'app, dialogues, rappels, bilan du mois, kit UI
├── lib/
│   ├── store.ts        # état local + persistance localStorage
│   ├── types.ts        # modèle de données
│   ├── revolut.ts      # normalisation des relevés Revolut
│   ├── csv.ts          # import / export CSV
│   ├── analytics.ts    # soldes, flux, séries mensuelles
│   ├── budgets.ts      # budgets, report, périmètres compte / catégorie
│   ├── goals.ts        # objectifs d'épargne, projections, suggestions
│   ├── years.ts        # bilan et comparaison des années
│   ├── recurrence.ts   # échéancier des récurrences
│   ├── subscriptions.ts# détection d'abonnements
│   ├── insights.ts     # rappels, solde bas, bilan du mois
│   └── rules.ts        # règles de catégorisation
└── data/           # relevé d'initialisation
```

La spécification fonctionnelle détaillée se trouve dans [`memory/SPEC.md`](memory/SPEC.md).
