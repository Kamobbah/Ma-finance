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

## Pages
/ Tableau de bord · /operations · /analyse · /epargne · /recurrences · /regles · /donnees (import CSV avec mapping/aperçu/doublons, import/export JSON, export CSV, comptes, catégories, réinitialisation avec saisie « RÉINITIALISER »).

## Auth
Aucune.
