# Catalog Service

Source de vérité pour les métadonnées de contenu (films/séries/shorts) — pas les fichiers vidéo eux-mêmes (ça, c'est Media Pipeline/Delivery). Voir `/docs/03-catalog.md` pour le modèle de données complet et `/proto/catalog.proto` pour le contrat gRPC.

## Implémenté

**V1 scope** : `Title` + un `MediaAsset` statique par titre. Genre, Season, Episode et Cast restent des features séparées à venir (`docs/03-catalog.md` les liste toutes, mais `docs/WORKFLOW.md` impose de découper par feature testable).

- `CreateTitle` : crée un `Title` en statut `DRAFT` — jamais `PUBLISHED` directement. Le slug public est dérivé de `originalTitle` + `releaseYear` (`src/domain/slug.ts`, ex: "The Matrix" + 1999 → `the-matrix-1999`) ; une collision de slug est rejetée (`ALREADY_EXISTS`) plutôt que résolue automatiquement avec un suffixe — simplification V1, à revoir si le catalogue grossit. `runtimeMinutes` est obligatoire pour `MOVIE`/`SHORT` et rejeté pour `SERIES` (le runtime vivra sur `Episode` quand cette feature existera).
- `GetTitleBySlug` : ne retourne jamais un titre qui n'est pas `PUBLISHED` — un vrai titre `DRAFT`/`ARCHIVED` se comporte exactement comme un slug inconnu (`NOT_FOUND` dans les deux cas). C'est ce qui empêche ce RPC de servir à découvrir du contenu non publié en essayant des slugs (`docs/03-catalog.md`, "Bonnes pratiques").
- `AttachMediaAsset` : associe (ou remplace) le fichier vidéo statique d'un `Title` — un seul par titre en V1 (pas encore d'`Episode`). Marque l'asset `READY` immédiatement : **pas de vrai pipeline d'upload/transcodage** (`04-media-pipeline.md`, Phase 2) — l'URL fournie par l'appelant est supposée déjà pointer vers un fichier lisible.
- `PublishTitle` : bascule un `Title` en `PUBLISHED` — refuse (`FAILED_PRECONDITION`) tant que le titre n'a pas de `MediaAsset` `READY`. Un titre n'est jamais publié sans avoir quelque chose de regardable derrière (`docs/03-catalog.md`, "Bonnes pratiques"). Pas de mutation pour dépublier/archiver pour l'instant.

**Frontière de confiance** : ces 4 RPCs ne revalident pas de token — ils font confiance à leur appelant (la Gateway, seule à pouvoir les atteindre, jamais exposée au navigateur) d'avoir déjà vérifié via `IdentityService.ValidateToken` que le compte appelant est admin (`Account.isAdmin`, cf. `services/identity/README.md`). C'est la même frontière de confiance déjà établie pour `accountId` sur `IdentityService.CreateProfile`.

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
| `src/domain/attachMediaAsset.ts` | Logique métier de `AttachMediaAsset` : attache/remplace le fichier vidéo statique d'un titre |
| `src/domain/publishTitle.ts` | Logique métier de `PublishTitle` : refuse tant qu'aucun `MediaAsset READY` n'existe |
| `src/domain/slug.ts` | Génération de slug (titre + année, accents/ponctuation normalisés) |
| `src/domain/schemas.ts` | Schémas Zod de validation d'entrée, dont la règle croisée `runtimeMinutes` (obligatoire MOVIE/SHORT, interdit SERIES) |
| `src/domain/errors.ts` | Erreurs métier typées, mappées en codes gRPC par `catalogServiceImpl.ts` |
| `src/domain/titleRepository.ts` | Port (interface) `TitleRepository` — permet de tester la logique métier sans DB |
| `src/domain/mediaAssetRepository.ts` | Port (interface) `MediaAssetRepository` |
| `src/infra/prismaTitleRepository.ts` | Implémentation Prisma du port `TitleRepository` — joint le (au plus un) `MediaAsset` sur chaque lecture |
| `src/infra/prismaMediaAssetRepository.ts` | Implémentation Prisma du port `MediaAssetRepository` (`upsert` par `titleId`) |
| `src/infra/prismaClient.ts` | Singleton `PrismaClient` du process |
| `src/infra/logger.ts` | Logger Pino du service |
| `prisma/schema.prisma` | Schéma DB du domaine Catalog (V1 : `Title` + `MediaAsset` — voir ER complet dans `docs/03-catalog.md`) |
| `prisma/migrations/` | Migrations versionnées — générées via `npm run prisma:migrate`, jamais éditées à la main |
| `tests/unit/` | Tests de `/domain` avec un repository en mémoire (pas de DB) |
| `tests/integration/` | Tests bout-en-bout : vrai PostgreSQL (Testcontainers) + vrai client gRPC |

## Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `CATALOG_DATABASE_URL` | Connexion PostgreSQL (Prisma) — base logique séparée de celle d'Identity, cf. `services/AGENT.md` §1.3 | — requis |
| `CATALOG_GRPC_ADDRESS` | Adresse d'écoute du serveur gRPC | `0.0.0.0:50052` |

**Note Prisma monorepo** : `prisma/schema.prisma` fixe `generator client { output = "../generated/prisma-client" }` — généré hors de `node_modules`, à côté de `src/` (pas dedans, pour que le chemin relatif reste valide une fois compilé dans `dist/`), jamais commité (`.gitignore`). Voir `docs/ARCHITECTURE.md` §6 pour le détail complet et l'historique des deux tentatives précédentes.

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

- `tests/unit/` : logique `/domain` pure, repositories en mémoire (`tests/unit/fakes/`) — pas de DB
- `tests/integration/catalogFlow.grpc.test.ts` : `CreateTitle` → `GetTitleBySlug` → `AttachMediaAsset` → `PublishTitle`, vrai PostgreSQL éphémère (Testcontainers) + vrai client gRPC.

## Régénérer les stubs gRPC

```bash
npm run proto:gen   # protoc + ts-proto, source: /proto/catalog.proto
```
