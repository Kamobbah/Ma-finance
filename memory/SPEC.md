# Ma Finance — SPEC

App web 100 % locale (aucun backend utilisé, aucun compte). UI en français, devise €.
Le backend FastAPI du template reste en place mais n'est PAS utilisé par l'app (exigence utilisateur : données uniquement sur l'appareil).

## Stockage
- IndexedDB `ma-finance` / store `kv` / clé `data` → objet `AppData` complet (src/lib/store.ts), sauvegarde auto (debounce 250 ms) après chaque modification. Fallback localStorage `ma-finance-data`.
- Préférences (filtre compte, année, interrupteur virements internes) : localStorage `ma-finance-prefs`.
- Premier lancement : `src/data/releve-2026.csv` (relevé Revolut) est parsé (src/lib/revolut.ts) puis catégorisé par les règles par défaut.

## Données initiales (seed)
- Comptes : Compte principal (acc-main, ouverture 54,85 €), Compte USD, Compte JPY (vides), Pockets : IMP: Économies, IMP: Achats, IMP: Voiture, Madré, Personnels, IMP: Prélèvements (pocket-<slug>), Compte d'épargne (acc-savings).
- Soldes au 28/10/2026 : Madré 809,56 €, Personnels 30,04 €, épargne 0,38 €, autres 0 → consolidé 839,98 €.
- ~1199 opérations 2026. Virements Pocket/épargne = internes (transfer_in/out). Côté épargne : opérations miroirs + intérêts + 1 « Ajustement de rapprochement » pour retrouver le solde de clôture (le relevé ne détaille que les intérêts).
- Choix utilisateur : « Vers le compte d'investissement » = Dépense (Investissement) ; « Petite monnaie de RevPoints » = Dépense (Arrondis RevPoints).
- 28 règles par défaut (les 6 exemples de l'utilisateur en tête ; « paie » en mot entier via regex `\bpaie\b` pour ne pas capturer « Paiement envoyé par »).
- 5 récurrences mensuelles détectées (Free Mobile, Cofica Bail, Opteven, Avanssur, CAF), prochaine échéance après aujourd'hui.
- Aucun objectif d'épargne.

## Modèle (src/lib/types.ts)
Account, Transaction (montant signé, type income|expense|transfer_in|transfer_out, internal, source import|manual|recurring, catStatus auto|manual|to_review), Category, Rule (conditions ET, catégorie, type optionnel), Recurrence (fréquence, fin never|date|count|amount, statut), Goal (cible, alloué, historique d'allocations).

## Règles métier
- Résultat net global : virements internes exclus sauf si l'interrupteur « Inclure les virements internes » est activé (alors transfer_in → revenus, transfer_out → dépenses).
- Récurrences : au démarrage, les échéances ≤ aujourd'hui sont créées (source recurring) et la prochaine échéance avance ; prévu = échéances futures dans la période.
- Règles : première règle active correspondante ; catégories manuelles jamais écrasées ; pas de correspondance → « Non classé » / À vérifier. Correction manuelle → toast proposant de créer une règle (/regles?desc=…&cat=…).
- Objectifs : répartition virtuelle ; alerte si total alloué > solde réel épargne.

## Fonctionnalités v2
- Détecteur d'abonnements (src/lib/subscriptions.ts, page Récurrences) : dépenses non internes, même marchand (description normalisée), montant ±10 % du dernier, ≥3 mois consécutifs (trou d'1 mois toléré), dernière occurrence < 45 jours, non couvertes par une récurrence existante. « Suivre en récurrence » crée une récurrence mensuelle en 1 clic ; « Ignorer » stocke la clé dans `dismissedSubscriptions`.
- Budgets (src/lib/budgets.ts, page /budgets) : `Budget {category, amount (défaut mensuel), overrides{"YYYY-MM": montant}}`. Dépensé = dépenses réelles (hors internes) de la catégorie, tous comptes EUR. Niveaux : ok <80 %, warn ≥80 %, over >100 %. Alertes : badge sur la nav, bandeau tableau de bord, toast après ajout/modif d'une opération. Vue annuelle cliquable pour ajuster un mois.
- Comptes & Pockets (/comptes, /comptes/:id) : solde, mini-courbe, transferts entrants/sortants ; détail avec évolution du solde, barres mensuelles, origines/destinations des transferts par compte, catégories de dépenses, liste des transferts. Lien « Voir les opérations » → /operations?account=<id>.

## Fonctionnalités v3
- Report de budget : `Budget.rollover` (défaut activé ; `false` = désactivé) + `startMonth`. Plafond effectif(mois) = plafond de base (défaut ou ajustement) + report, report = max(0, plafond effectif du mois précédent − dépensé), calculé depuis `startMonth` jusqu'au mois en cours. Seul le reste positif est reporté (choix utilisateur). Puce « +X € reportés ».
- Rappels d'échéances (src/lib/insights.ts `upcomingReminders`, bandeau global `RemindersBar` en haut de chaque page + toast à l'ouverture) : récurrences de dépense actives dont l'échéance tombe aujourd'hui → J+3 (étapes J-3, J-1, J ; le jour J inclut les opérations récurrentes générées aujourd'hui). Masquage par rappel stocké dans prefs `dismissedReminders` (clé recId|date|étape → un rappel masqué à J-3 réapparaît à J-1 puis J).
- Bilan du mois (`computeRecap`, `MonthlyRecapDialog`) : s'ouvre automatiquement à la 1re ouverture d'un mois pour le mois écoulé (prefs `lastRecapSeen`), puis carte « Bilan du mois écoulé » sur le tableau de bord ; navigation mois précédent/suivant. Contenu : revenus/dépenses/net réels vs mois précédent, budgets tenus, top 3 catégories, Pockets (transferts in/out, solde fin), épargne (solde début→fin, versements/retraits, intérêts, allocations objectifs).
- Tirelire de Pocket : `Account.goal {target, targetDate?, label?}` ; panneau sur /comptes/:id (Pockets) avec jauge solde/cible, reste, à verser par mois, rythme (variation moyenne 3 mois), date d'atteinte estimée ; mini-jauge sur les cartes /comptes.

## Fonctionnalités v3
- Report de budget : `Budget.rollover` (activé par défaut, désactivable par budget) + `startMonth`. Plafond effectif = plafond du mois (défaut/ajusté) + report ; report = reste POSITIF du mois précédent (les dépassements ne sont pas reportés), chaîné depuis startMonth, jamais au-delà du mois en cours.
- Rappels d'échéances (src/lib/insights.ts, components/RemindersBar.tsx, visible en haut de toutes les pages) : récurrences de dépense dont l'échéance est aujourd'hui ou dans les 3 prochains jours (étapes J-3, J-1, J ; J inclut les opérations récurrentes générées aujourd'hui). Masquables (prefs.dismissedReminders, clé recId|date|étape). Toast à l'ouverture.
- Bilan du mois (components/MonthlyRecapDialog.tsx) : fenêtre automatique à la 1re ouverture du mois pour le mois écoulé (prefs.lastRecapSeen), carte « Bilan du mois écoulé » sur le tableau de bord ; revenus/dépenses/net vs mois précédent, budgets tenus, top dépenses, Pockets alimentées, épargne (solde, versements, intérêts, allocations). Navigation mois précédent/suivant.
- Tirelire de Pocket (components/PocketGoal.tsx) : `Account.goal {target, targetDate?, label?}` ; jauge solde réel / cible sur la page de la Pocket, à verser par mois, rythme (variation moyenne 3 mois), date estimée ; mini-jauge sur la carte Comptes & Pockets.

## Pages
/ Tableau de bord · /operations · /comptes · /comptes/:id · /analyse · /budgets · /epargne · /recurrences · /regles · /donnees (import CSV avec mapping/aperçu/doublons, import/export JSON, export CSV, comptes, catégories, réinitialisation avec saisie « RÉINITIALISER »).

## Auth
Aucune.
