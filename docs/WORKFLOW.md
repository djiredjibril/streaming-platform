# WORKFLOW.md — Boucle de développement par feature

Ce processus s'applique à **chaque feature**, backend ou frontend, quel que soit le domaine (`01` à `07`). Il s'applique aussi bien à un développement humain qu'à un agent IA (Claude Code ou autre) travaillant sur ce projet.

```
┌─────────────────┐
│ 1. Planifier     │
└────────┬─────────┘
         ▼
┌─────────────────┐      non bon
│ 2. Challenger    │◄──────────────┐
│    le plan       │                │
└────────┬─────────┘                │
         │ bon                      │
         ▼                          │
┌─────────────────┐                 │
│    Implémenter   │─────────────────┘
└────────┬─────────┘   (replanifier)
         ▼
┌─────────────────┐
│ 3. Tester        │
└────────┬─────────┘
         │
    ┌────┴────┐
    ▼         ▼
  échec      succès
    │         │
    ▼         ▼
┌────────┐  ┌──────────────────┐
│ Debug  │  │ Commit (non signé, │
│        │  │ par thème/lot)     │
└───┬────┘  └─────────┬──────────┘
    │ (retour test)    ▼
    └─────────────►  4. Feature suivante
```

## 1. Planifier la feature

Avant d'écrire du code, produire un plan écrit et court (quelques lignes à quelques paragraphes selon la taille de la feature) qui couvre :
- Ce que la feature fait, précisément (référence au fichier de spec de domaine concerné, ex: `01-identity.md`)
- Les fichiers/modules qui seront créés ou modifiés
- Le modèle de données impacté (nouvelle table, colonne, migration)
- L'approche de test prévue (quels cas, quel niveau — unitaire/intégration/E2E)
- Les risques ou zones d'incertitude identifiés

Le plan n'a pas besoin d'être exhaustif au mot près — il doit être suffisant pour qu'un tiers (ou l'étape 2) puisse juger s'il est correct sans avoir à lire le code.

## 2. Challenger la planification

Avant d'implémenter, le plan est confronté à une relecture critique — par toi, ou par l'agent lui-même en mode "auto-critique" explicite (pas juste "ça a l'air bien"). Points à vérifier systématiquement :

- **Cohérence avec la spec de domaine** : le plan respecte-t-il le modèle de données et les contrats définis dans `0X-<domaine>.md` ?
- **Sécurité** : le plan introduit-il une vérification manquante (auth, autorisation, validation d'entrée) ?
- **Effets de bord inter-domaines** : la feature touche-t-elle un autre service ? Si oui, via quel contrat (gRPC/GraphQL/REST) ?
- **Testabilité** : le plan permet-il d'écrire des tests qui vérifient réellement le comportement, pas juste "ça compile" ?

### 2.1 — Si le plan n'est pas bon

Retour à l'étape 1 avec les objections identifiées explicitement listées. Ne pas corriger silencieusement en cours d'implémentation — on replanifie d'abord.

### 2.2 — Si le plan est bon

Passage à l'implémentation, en suivant le plan validé. Un écart significatif découvert en cours d'implémentation (le plan s'avère infaisable tel quel) déclenche un retour à l'étape 1, pas une improvisation silencieuse.

## 3. Tester

Suivre la pyramide de tests définie dans `AGENT-BACKEND.md`/`AGENT-FRONTEND.md` selon le type de feature. Une feature n'est testée qu'une fois complètement implémentée selon le plan validé.

### 3.1 — Si les tests échouent

Debug. Le correctif est vérifié en re-exécutant les tests, pas seulement en relisant le code. Si le debug révèle que le plan initial était en fait incorrect (pas juste un bug d'implémentation), retour à l'étape 1.

### 3.2 — Si les tests réussissent

Commit — avec ces règles précises :
- **Non signé** : pas de signature GPG sur le commit (`git commit` sans `-S`, et vérifier qu'aucune configuration globale (`commit.gpgSign`) ne force la signature sur ce repo)
- **Par thème/lot** : un commit regroupe un ensemble cohérent de changements liés à une même feature ou un même sous-thème — pas un commit par fichier modifié, et pas non plus un commit fourre-tout mélangeant plusieurs features sans rapport. Le message de commit reflète le thème du lot (ex: `feat(identity): register + login flow with argon2id hashing`)

## 4. Feature suivante

Une fois le commit effectué, passage à la feature suivante en respectant l'ordre de phasage défini dans `00-OVERVIEW.md` (Phase 1 → 2 → 3 → 4, domaines dans l'ordre indiqué à l'intérieur de chaque phase).

## Note sur la granularité d'une "feature"

Une feature dans ce processus correspond à une unité de travail testable de façon autonome — par exemple "endpoint Register avec validation + hash de mot de passe", pas "tout le domaine Identity" d'un coup. Découper trop large rend l'étape 2 (challenge) inefficace, faute de pouvoir juger un plan trop vague.
