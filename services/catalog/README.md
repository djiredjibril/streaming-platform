# Catalog Service

Source de vérité pour les métadonnées de contenu (films/séries/shorts) — pas les fichiers vidéo eux-mêmes (ça, c'est Media Pipeline/Delivery). Voir `/docs/03-catalog.md` pour le modèle de données complet et `/proto/catalog.proto` pour le contrat gRPC.

## Implémenté

**V1 scope** : uniquement `Title` (métadonnées communes film/série/short). Genre, Season, Episode, MediaAsset et Cast sont des features séparées à venir (`docs/03-catalog.md` les liste toutes, mais `docs/WORKFLOW.md` impose de découper par feature testable).

- `CreateTitle` : crée un `Title` en statut `DRAFT` — jamais `PUBLISHED` directement, il n'existe pas encore de mutation `publishTitle` (feature à venir). Le slug public est dérivé de `originalTitle` + `releaseYear` (`src/domain/slug.ts`, ex: "The Matrix" + 1999 → `the-matrix-1999`) ; une collision de slug est rejetée (`ALREADY_EXISTS`) plutôt que résolue automatiquement avec un suffixe — simplification V1, à revoir si le catalogue grossit. `runtimeMinutes` est obligatoire pour `MOVIE`/`SHORT` et rejeté pour `SERIES` (le runtime vivra sur `Episode` quand cette feature existera).
- `GetTitleBySlug` : ne retourne jamais un titre qui n'est pas `PUBLISHED` — un vrai titre `DRAFT`/`ARCHIVED` se comporte exactement comme un slug inconnu (`NOT_FOUND` dans les deux cas). C'est ce qui empêche ce RPC de servir à découvrir du contenu non publié en essayant des slugs (`docs/03-catalog.md`, "Bonnes pratiques").

**Frontière de confiance pour `CreateTitle`** : ce RPC ne revalide pas de token lui-même — il fait confiance à son appelant (la Gateway, seule à pouvoir l'atteindre, jamais exposé au navigateur) d'avoir déjà vérifié via `IdentityService.ValidateToken` que le compte appelant est admin (`Account.isAdmin`, cf. `services/identity/README.md`). C'est la même frontière de confiance déjà établie pour `accountId` sur `IdentityService.CreateProfile`.

## Architecture

Même architecture hexagonale que Identity (`services/AGENT.md`, section 3) : `/domain` ne dépend de rien d'externe, `/infra` implémente les ports du domaine, `/grpc` traduit proto ↔ domaine.

### Table des fichiers

| Fichier | Rôle |
|---|---|
| `src/index.ts` | Point d'entrée process : démarre le serveur gRPC |
| `src/grpc/server.ts` | Construit le `grpc.Server`, injecte les dépendances |
| `src/grpc/catalogServiceImpl.ts` | Implémentation des handlers `CatalogService` (adaptateur proto ↔ domaine) |
| `src/grpc/generated/catalog.ts` | **Généré** par `npm run proto:gen` depuis `/proto/catalog.proto` — ne pas éditer à la main |
| `src/domain/createTitle.ts` | Logique métier de `CreateTitle` : validation, génération de slug, détection de collision |
| `src/domain/getTitleBySlug.ts` | Logique métier de `GetTitleBySlug` : ne renvoie que du `PUBLISHED` |
| `src/domain/slug.ts` | Génération de slug (titre + année, accents/ponctuation normalisés) |
| `src/domain/schemas.ts` | Schémas Zod de validation d'entrée, dont la règle croisée `runtimeMinutes` (obligatoire MOVIE/SHORT, interdit SERIES) |
| `src/domain/errors.ts` | Erreurs métier typées, mappées en codes gRPC par `catalogServiceImpl.ts` |
| `src/domain/titleRepository.ts` | Port (interface) `TitleRepository` — permet de tester la logique métier sans DB |
| `src/infra/prismaTitleRepository.ts` | Implémentation Prisma du port `TitleRepository` |
| `src/infra/prismaClient.ts` | Singleton `PrismaClient` du process |
| `src/infra/logger.ts` | Logger Pino du service |
| `prisma/schema.prisma` | Schéma DB du domaine Catalog (V1 : `Title` uniquement — voir ER complet dans `docs/03-catalog.md`) |
| `prisma/migrations/` | Migrations versionnées — générées via `npm run prisma:migrate`, jamais éditées à la main |
| `tests/unit/` | Tests de `/domain` avec un repository en mémoire (pas de DB) |
| `tests/integration/` | Tests bout-en-bout : vrai PostgreSQL (Testcontainers) + vrai client gRPC |

## Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `CATALOG_DATABASE_URL` | Connexion PostgreSQL (Prisma) — base logique séparée de celle d'Identity, cf. `services/AGENT.md` §1.3 | — requis |
| `CATALOG_GRPC_ADDRESS` | Adresse d'écoute du serveur gRPC | `0.0.0.0:50052` |

**Note Prisma monorepo** : `prisma/schema.prisma` fixe `generator client { output = "../node_modules/@prisma/client" }` — sans ça, `prisma generate` écrirait dans le `node_modules/.prisma/client` racine partagé par tout le workspace npm, et écraserait silencieusement le client généré d'un autre service (ça a cassé Identity une fois pendant le développement de cette feature, cf. le commit `fix(monorepo)` juste avant celui-ci).

## Lancer en local

```bash
docker compose up -d postgres   # depuis la racine du repo — crée aussi la DB `catalog` (docker/postgres-init/)
cp ../../.env.example ../../.env  # si pas déjà fait
npm run prisma:migrate           # applique les migrations
npm run build && node dist/index.js
```

## Tests

```bash
npm test              # depuis la racine, ou `npx vitest run` ici
```

- `tests/unit/` : logique `/domain` pure, repository en mémoire (`tests/unit/fakes/`) — pas de DB
- `tests/integration/catalogFlow.grpc.test.ts` : `CreateTitle` → `GetTitleBySlug`, vrai PostgreSQL éphémère (Testcontainers) + vrai client gRPC. Aucune mutation `publishTitle` n'existe encore, donc le cas "titre publié" bascule le statut directement via Prisma — même pattern que le test d'intégration du rôle admin côté Identity.

## Régénérer les stubs gRPC

```bash
npm run proto:gen   # protoc + ts-proto, source: /proto/catalog.proto
```
