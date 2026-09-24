# Identity Service

Source de vérité pour l'authentification et l'état des comptes. Voir `/docs/01-identity.md` pour le modèle de données complet et `/proto/identity.proto` pour le contrat gRPC.

## Implémenté

- `Register` : crée un `Account` (+ `StudentVerification` si `ETUDIANT`) avec un mot de passe hashé en argon2id. L'account est créé `PENDING_VERIFICATION` et **aucun token n'est émis** — `access_token`/`refresh_token` reviennent vides tant qu'une étape de vérification (à venir) n'a pas activé le compte. Voir le commentaire sur `rpc Register` dans le `.proto`.

## Architecture

Le service suit une architecture hexagonale simple (cf. `services/AGENT.md`, section 3) : `/domain` ne dépend de rien d'externe (ni Prisma, ni gRPC), `/infra` implémente les ports du domaine, `/grpc` est la couche de transport qui traduit proto ↔ domaine.

```
Requête gRPC (Register)
        │
        ▼
  grpc/server.ts               <- bind/listen, construit le graphe de dépendances
        │
        ▼
  grpc/identityServiceImpl.ts  <- traduit RegisterRequest (proto) -> input domaine,
        │                          traduit les erreurs domaine -> codes gRPC
        ▼
  domain/registerAccount.ts    <- logique métier pure : validation, hash argon2id,
        │                          règle "email déjà pris"
        ▼
  domain/accountRepository.ts  <- interface (port), pas d'implémentation ici
        │
        ▼
  infra/prismaAccountRepository.ts  <- implémentation Prisma du port ci-dessus
```

### Table des fichiers

| Fichier | Rôle |
|---|---|
| `src/index.ts` | Point d'entrée process : démarre le serveur gRPC |
| `src/grpc/server.ts` | Construit le `grpc.Server`, injecte les dépendances (repository, logger) |
| `src/grpc/identityServiceImpl.ts` | Implémentation des handlers `IdentityService` (adaptateur proto ↔ domaine) |
| `src/grpc/generated/identity.ts` | **Généré** par `npm run proto:gen` depuis `/proto/identity.proto` — ne pas éditer à la main |
| `src/domain/registerAccount.ts` | Logique métier de `Register` : validation, hash, règles |
| `src/domain/schemas.ts` | Schémas Zod de validation d'entrée |
| `src/domain/errors.ts` | Erreurs métier typées, mappées en codes gRPC par `identityServiceImpl.ts` |
| `src/domain/accountRepository.ts` | Port (interface) `AccountRepository` — permet de tester `registerAccount` sans DB |
| `src/infra/prismaAccountRepository.ts` | Implémentation Prisma du port `AccountRepository` |
| `src/infra/prismaClient.ts` | Singleton `PrismaClient` du process |
| `src/infra/logger.ts` | Logger Pino du service (via `@streaming/shared-logging`) |
| `prisma/schema.prisma` | Schéma DB complet du domaine Identity (voir ER dans `docs/01-identity.md`) |
| `prisma/migrations/` | Migrations versionnées — générées via `npm run prisma:migrate`, jamais éditées à la main |
| `tests/unit/` | Tests de `/domain` avec un repository en mémoire (pas de DB) |
| `tests/integration/` | Tests bout-en-bout : vrai PostgreSQL (Testcontainers) + vrai client gRPC |

## Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `DATABASE_URL` | Connexion PostgreSQL (Prisma) | — requis |
| `IDENTITY_GRPC_ADDRESS` | Adresse d'écoute du serveur gRPC | `0.0.0.0:50051` |

## Lancer en local

```bash
docker compose up -d postgres   # depuis la racine du repo
cp ../../.env.example ../../.env  # si pas déjà fait
npm run prisma:migrate           # applique les migrations
npm run build && node dist/index.js
```

## Tests

```bash
npm test              # depuis la racine, ou `npx vitest run` ici
```

- `tests/unit/registerAccount.test.ts` : logique domaine pure, repository en mémoire (pas de DB)
- `tests/integration/register.grpc.test.ts` : Testcontainers (vrai PostgreSQL éphémère) + vrai client gRPC — aucune donnée mockée

## Régénérer les stubs gRPC

```bash
npm run proto:gen   # protoc + ts-proto, source: /proto/identity.proto
```
