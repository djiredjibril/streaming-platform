# Plateforme de Streaming — Vue d'ensemble

## Vision

Application web complète (frontend + backend) permettant de regarder des films, séries et courts-métrages ("shorts"), avec :

- Authentification & autorisation
- Plans d'abonnement et types de comptes (perso, famille, étudiant) avec réductions
- Suggestions de contenu basées sur la proximité sociale ou des centres d'intérêt communs
- Interactions sociales : commentaires, like/dislike, partage, recommandation entre utilisateurs

## Double objectif du projet

1. **Apprentissage** — appliquer et approfondir des compétences backend (modélisation de données, traitement asynchrone, architecture de services, communication inter-services)
2. **Construction réelle** — livrer une plateforme fonctionnelle, pas un simple exercice jetable

Pour la V1, le streaming vidéo est **réel** : upload, transcodage, delivery adaptatif — pas juste des métadonnées ou des liens externes.

## Pourquoi c'est plus complexe qu'un CRUD classique

Le pipeline média (upload → transcodage → stockage → delivery HLS/DASH) est un traitement asynchrone lourd, indépendant du reste de l'application. C'est le domaine le plus exigeant techniquement du projet, et il doit être traité comme tel : isolé, testé à part, avec ses propres contraintes de performance.

## Domaines fonctionnels (bounded contexts)

| Domaine | Responsabilité | Complexité | Fichier de spec |
|---|---|---|---|
| **Identity** | Auth, authz, comptes (perso/famille/étudiant) | Moyenne | `01-identity.md` |
| **Billing** | Plans, réductions, cycle de vie abonnement | Moyenne | `02-billing.md` |
| **Catalog** | Métadonnées films/séries/épisodes/shorts | Faible | `03-catalog.md` |
| **Media Pipeline** | Upload → transcodage → stockage | Élevée | `04-media-pipeline.md` |
| **Streaming/Delivery** | Manifests HLS/DASH, contrôle d'accès au contenu | Élevée | `05-delivery.md` |
| **Social** | Commentaires, like/dislike, partage, recommandation entre users | Faible-Moyenne | `06-social.md` |
| **Discovery/Recs** | Suggestions basées sur intérêts communs / proximité sociale | Moyenne | `07-discovery.md` |

Chaque domaine est un candidat naturel pour un service séparé. gRPC est pertinent pour la communication interne rapide entre services (ex: Delivery → Identity pour vérifier l'accès), GraphQL pour la couche client-facing qui agrège catalog + recs + social.

## Les trois styles d'API du projet — et où est le REST

Le projet utilise **trois** styles d'API, chacun là où il est le plus adapté — pas un choix arbitraire, et pas un oubli du REST :

| Style | Usage | Exemples dans les specs |
|---|---|---|
| **GraphQL** | Client web ↔ backend, via la gateway, pour tout ce qui n'est pas l'authentification/gestion de compte. Agrège plusieurs domaines en une requête | `Query.browseTitles`, `Mutation.postComment` |
| **gRPC** | Communication interne service ↔ service, appels fréquents, typés, performants. **Jamais exposé directement au client**, y compris pour l'auth | `IdentityService.ValidateToken`, `BillingService.IsSubscriptionActive`, `IdentityService.Register` |
| **REST/HTTP** | (1) Authentification/gestion de compte client-facing (2) webhooks tiers (3) delivery de fichiers binaires/manifests | `POST /auth/register` (01-identity), `POST /webhooks/stripe` (02-billing), `GET /delivery/manifest/{content_id}` (05-delivery) |

**Pourquoi ces cas précis sont REST/HTTP et pas GraphQL/gRPC** :
- **Authentification/gestion de compte** (`register`, `login`, `logout`, `refresh`, `me`, profils) : décision explicite du projet — GraphQL gère mal nativement les cookies `httpOnly` nécessaires au refresh token (cf. `apps/web/AGENT.md` sur la gestion de session), et un endpoint REST classique (`Set-Cookie` dans la réponse) le fait sans détour. La Gateway traduit ces routes REST en appels gRPC internes vers Identity, exactement comme elle le fait pour GraphQL sur les autres domaines — seul le transport client-facing change, pas l'architecture interne
- Un **webhook** (Stripe qui notifie un paiement) est par nature un appel HTTP POST simple initié par un tiers — Stripe ne parle pas gRPC ni GraphQL, donc ce point d'entrée est forcément un endpoint REST classique
- Un **manifest HLS ou un segment vidéo** est un fichier binaire/texte servi par URL — un lecteur vidéo HLS fait des `GET` HTTP standards, pas des requêtes GraphQL

**Si tu veux volontairement approfondir REST comme troisième style d'API à comparer** (en plus de GraphQL et gRPC déjà dans ton learning path `graphql-example/`/`grpc-example/`), un bon candidat serait d'exposer **Catalog en REST en parallèle de GraphQL** — ce domaine est simple et read-heavy, donc idéal pour comparer concrètement les deux approches sur le même cas d'usage (comme tu l'as fait pour les 6 DBMS). Dis-moi si tu veux que j'ajoute cette variante à `03-catalog.md`.

## Phasage

### Phase 1 — Fondations
Identity + Catalog (CRUD films/séries) + lecture d'un fichier vidéo statique unique (pas encore de transcodage).
→ Objectif : un flux end-to-end fonctionnel rapidement, sans la complexité du pipeline média.

### Phase 2 — Media Pipeline
Upload réel + transcodage (ffmpeg + job queue) + packaging HLS.
→ Objectif : maîtriser le traitement asynchrone lourd et le stockage objet.

### Phase 3 — Billing
Plans d'abonnement, types de comptes, réductions, contrôle d'accès au contenu selon le plan.
→ Objectif : logique métier de facturation + intégration avec Identity et Delivery.

### Phase 4 — Social & Recs
Commentaires/likes/partage, puis suggestions de contenu.
→ Objectif : recommandation basée sur des données d'usage réelles, générées par les phases précédentes.

**Justification de l'ordre** : les recommandations dépendent de données d'usage (vues, likes) qui n'existent pas tant qu'il n'y a pas de vrai flux de visionnage. La facturation dépend d'un catalogue et d'un contrôle d'accès déjà en place. On construit dans l'ordre des dépendances, pas dans l'ordre de "l'importance perçue".

## État d'avancement

- [ ] Phase 1 — Identity + Catalog
- [ ] Phase 2 — Media Pipeline
- [ ] Phase 3 — Billing
- [ ] Phase 4 — Social & Recs

## Guides d'implémentation

- `AGENT-BACKEND.md` — stack technique, structure de repo, standards de tests/logs/audit/sécurité/documentation pour l'implémentation backend
- `AGENT-FRONTEND.md` — stack technique, structure de projet, standards de tests/a11y/observabilité/documentation pour l'implémentation frontend
- `WORKFLOW.md` — boucle de travail à suivre pour chaque feature (planifier → challenger → implémenter → tester → committer)

## Fichiers du projet

```
00-OVERVIEW.md          <- ce fichier
01-identity.md
02-billing.md
03-catalog.md
04-media-pipeline.md
05-delivery.md
06-social.md
07-discovery.md
AGENT-BACKEND.md
AGENT-FRONTEND.md
WORKFLOW.md
```

## Prochaine étape

Toutes les specs de domaine et les guides d'implémentation sont rédigés. Étape suivante : démarrer l'implémentation Phase 1 (`01-identity.md` + `03-catalog.md`) en suivant `AGENT-BACKEND.md`.
