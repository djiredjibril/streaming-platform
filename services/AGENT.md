# AGENT.md — Backend Implementation Guide

Ce document encadre tout agent (humain ou IA) qui implémente le backend de la plateforme de streaming. Il s'appuie sur les specs de domaine `01` à `07`. À lire avant toute génération de code sur ce projet, avec `WORKFLOW.md` qui définit la boucle plan → challenge → implémentation → test → commit à suivre pour chaque feature, et `ARCHITECTURE.md` qui détaille — avec un parcours de requête réel — comment gRPC/REST/GraphQL s'articulent et pourquoi chaque package de la stack ci-dessous a été retenu.

## 1. Principes non négociables

1. **Aucun secret en dur dans le code** — tout passe par variables d'environnement (`.env`, jamais commité), validées au démarrage (fail-fast si une variable requise manque)
2. **Aucune logique de sécurité côté client ne remplace une vérification côté serveur** — le filtrage kids, le contrôle d'accès, le prix d'abonnement sont TOUJOURS revalidés côté serveur, même si le client les calcule aussi pour l'UX
3. **Chaque domaine (`01`-`07`) est un service isolé** — pas d'accès direct à la base de données d'un autre domaine ; toute communication inter-domaine passe par gRPC (interne) ou événements
4. **Aucun code marchand sans test correspondant** — un PR qui touche Billing sans test associé est refusée par principe
5. **Aucune fonctionnalité n'est "terminée" sans logs et sans qu'un test échoue si elle casse**

## 2. Stack technique recommandée

| Composant | Choix | Justification |
|---|---|---|
| Langage | TypeScript (Node.js) | Cohérent avec ton stack existant, typage statique = moins de bugs en équipe/agent |
| Framework HTTP/GraphQL Gateway | Fastify (routes REST `/auth/*`) + GraphQL Yoga monté dessus (tout le reste) | Auth/gestion de compte exposée en REST par décision de projet (cf. `00-OVERVIEW.md`, "Les trois styles d'API") — Fastify sert de socle HTTP commun aux deux |
| gRPC | `@grpc/grpc-js` + `ts-proto` (génère des types TS depuis les `.proto`) | Cohérent avec `grpc-example/` déjà construit |
| ORM/Query builder | **Prisma** (tranché — voir `ARCHITECTURE.md` §5 pour le pourquoi face à Drizzle) | Migrations versionnées, typage des requêtes — évite le SQL à la main sauf cas spécifiques (ex: requêtes de similarité en 07) |
| Base de données | PostgreSQL | Déjà comparé et maîtrisé dans `dbms-comparison/` |
| Queue/Jobs | BullMQ + Redis | cf. `04-media-pipeline.md` |
| Tests | Vitest (unitaire/intégration) + Testcontainers (DB réelle en test) | Cohérent avec ta CI/CD React déjà explorée |
| Logging | Pino (structuré, JSON) | Performant, standard Node.js pour du logging structuré |
| Validation d'entrée | Zod | Validation de schéma côté API, réutilisable pour typer les DTOs |

## 3. Structure de repository

Monorepo, un dossier par service, cohérent avec ta méthode de travail existante :

```
/streaming-platform
  /services
    /identity
    /billing
    /catalog
    /media-pipeline
    /delivery
    /social
    /discovery
    /gateway          <- expose REST (/auth/*) + GraphQL (le reste) au frontend, appelle les services en gRPC
  /proto              <- fichiers .proto partagés entre services
  /packages
    /shared-types      <- types TS générés/partagés
    /shared-logging    <- config Pino commune
  docker-compose.yml   <- Postgres, Redis, MinIO en local
  README.md
```

Chaque service a sa propre structure interne standard :
```
/services/identity
  /src
    /domain          <- logique métier pure, sans dépendance framework
    /infra           <- accès DB, clients gRPC sortants
    /grpc            <- implémentation du service gRPC (server)
    /graphql         <- resolvers si exposé directement en GraphQL
  /tests
    /unit
    /integration
  Dockerfile
  package.json
```

**Pourquoi séparer `domain` de `infra`** : la logique métier (ex: "un compte étudiant doit être vérifié avant d'appliquer la réduction") doit être testable sans base de données réelle. C'est le principe d'architecture hexagonale, appliqué simplement — pas besoin d'un framework DDD complet pour ce projet, juste cette séparation de base.

## 4. Tests — exigence de rigueur

### Pyramide de tests attendue

| Niveau | Cible | Outil | Quand |
|---|---|---|---|
| Unitaire | Logique métier pure (`/domain`) | Vitest | À chaque fonction de logique non triviale |
| Intégration | Un service + sa vraie DB (via Testcontainers) | Vitest + Testcontainers | À chaque endpoint/RPC |
| Contrat gRPC | Vérifie que le service respecte son `.proto` | Vitest + client gRPC réel | À chaque service gRPC |
| E2E | Parcours complet à travers plusieurs services | Playwright (déjà utilisé côté frontend) ou script gRPC multi-appels | Sur les parcours critiques (souscription, lecture vidéo) |

### Règles

- **Aucun mock de la base de données pour les tests d'intégration** — utiliser Testcontainers (vrai PostgreSQL éphémère) pour éviter les faux positifs d'un mock qui diverge du comportement réel
- **Tests obligatoires avant merge sur les domaines Identity et Billing** — ce sont les deux domaines où un bug a le plus de conséquences (sécurité, argent)
- **Couverture cible : 80% sur `/domain`**, pas de seuil arbitraire sur `/infra` (le code d'infra bénéficie plus des tests d'intégration que du coverage unitaire)
- **Tests de régression obligatoires pour tout bug corrigé** — un bug corrigé sans test associé peut revenir silencieusement

## 5. Logging — standard à travers tous les services

- **Format structuré JSON** (Pino), jamais de `console.log` de debug laissé en place
- **Champs obligatoires sur chaque log** : `timestamp`, `service_name`, `level`, `message`, `correlation_id`
- **Correlation ID propagé à travers les appels gRPC** (dans les métadonnées gRPC) — permet de suivre une requête utilisateur à travers Gateway → Identity → Billing → Delivery dans les logs
- **Niveaux** : `error` (nécessite investigation), `warn` (anormal mais géré), `info` (événements métier significatifs : souscription créée, transcodage terminé), `debug` (désactivé en production par défaut)
- **Ne jamais logger de secrets/mots de passe/tokens en clair** — masquer explicitement (`***`) dans les logs, même en erreur

## 6. Audit — au-delà des logs applicatifs

Certains domaines nécessitent un **audit trail** distinct des logs techniques (déjà mentionné dans les specs `01` et `02`) :
- Identity : `AuditLog` (login, changement de mot de passe, révocation de token)
- Billing : `PaymentEvent` (tous les événements de paiement bruts)
- Delivery : logs d'accès détaillés (qui a regardé quoi, quand, résultat de `CheckAccess`)

**Différence audit vs log** : l'audit trail est immuable, structuré, conservé plus longtemps, et interrogeable pour répondre à "que s'est-il passé sur ce compte le X" — le log applicatif sert au debug technique court-terme.

## 7. Sécurité — checklist par domaine

- [ ] Identity : argon2id pour les mots de passe, rotation de refresh tokens, rate limiting login
- [ ] Billing : vérification de signature webhook, idempotency keys, jamais de prix venant du client
- [ ] Media Pipeline : validation MIME réelle, scan antivirus, presigned URLs à expiration courte
- [ ] Delivery : signed URLs à expiration courte, re-vérification d'accès à chaque manifest, filtrage d'âge en défense en profondeur
- [ ] Social : sanitization du texte libre, rate limiting sur les écritures
- [ ] Tous les services : validation stricte des entrées (Zod) avant toute logique métier, jamais de confiance implicite dans les données reçues d'un autre service interne non plus (defense in depth, même en interne)

## 8. Gestion des erreurs

- **gRPC** : utiliser les codes standards (`NOT_FOUND`, `PERMISSION_DENIED`, `INVALID_ARGUMENT`, `UNAUTHENTICATED`) — jamais tout remonter en `UNKNOWN`/`INTERNAL`
- **GraphQL** : erreurs typées (codes d'erreur métier explicites dans `extensions.code`), pas de message d'erreur brut de la DB exposé au client
- **Jamais de stack trace exposée au client en production** — logguée côté serveur, message générique côté client

## 9. Migrations de base de données

- Toute modification de schéma passe par une migration versionnée (Prisma Migrate ou équivalent), jamais de modification manuelle en base
- Les migrations sont testées en CI avant merge (appliquées sur une DB de test éphémère)
- Pas de migration destructive (`DROP COLUMN`) déployée directement en production sans étape intermédiaire de dépréciation

## 10. Documentation — exigence par implémentation

Aucune feature, outil ou service n'est considéré terminé sans documentation associée :

- **README par service** (`/services/<domaine>/README.md`) : rôle du service, comment le lancer localement, variables d'environnement requises, comment lancer ses tests
- **Docstrings (TSDoc) sur toute fonction publique de `/domain`** : ce qu'elle fait, ses paramètres, ce qu'elle retourne, et surtout **pourquoi** une règle métier existe si elle n'est pas évidente (ex: pourquoi le refresh token est hashé et pas stocké en clair)
- **Schéma ER à jour** (Mermaid, cf. section correspondante de chaque `0X-<domaine>.md`) : si une migration change le schéma, le diagramme Mermaid du fichier de spec est mis à jour dans le même commit — jamais laissé obsolète
- **`.proto` commentés** : chaque service gRPC et chaque champ significatif porte un commentaire `//` expliquant son usage, pas seulement son type
- **Changelog par service** (`CHANGELOG.md` simple) tenu à jour à chaque commit "par thème" (cf. `WORKFLOW.md`) — une ligne par lot de changement, pas par fichier modifié
- **Tout choix d'architecture non trivial documenté à l'endroit où il est pris** — un commentaire dans le code ou une note dans le README du service, pas seulement dans les fichiers de spec `0X-<domaine>.md` qui peuvent diverger du code au fil du temps

## 11. CI/CD (à construire en s'appuyant sur ton exploration GitHub Actions déjà faite)

Pipeline minimal par service, à chaque PR :
1. Lint + typecheck
2. Tests unitaires
3. Tests d'intégration (Testcontainers)
4. Build Docker image
5. (Sur `main` uniquement) déploiement

## Ordre d'implémentation recommandé

Suivre le phasage des specs de domaine : `01-identity` + `03-catalog` (Phase 1) → `04-media-pipeline` (Phase 2) → `02-billing` + `05-delivery` (Phase 3) → `06-social` + `07-discovery` (Phase 4).
