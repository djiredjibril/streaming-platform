# Identity Service

Source de vérité pour l'authentification et l'état des comptes. Voir `/docs/01-identity.md` pour le modèle de données complet et `/proto/identity.proto` pour le contrat gRPC.

## Implémenté

- `Register` : crée un `Account` (+ `StudentVerification` si `ETUDIANT`) avec un mot de passe hashé en argon2id. L'account est créé `PENDING_VERIFICATION` et **aucun token n'est émis** — `access_token`/`refresh_token` reviennent vides tant que `VerifyEmail` n'a pas activé le compte. La réponse contient aussi `email_verification_token` (V1 mock : pas d'envoi d'email réel, cf. commentaire sur `rpc VerifyEmail` dans le `.proto`).
- `VerifyEmail` : échange ce token contre l'activation du compte (`status = ACTIVE`). Token à usage unique, expire après 24h.
- `Login` : authentifie par email/mot de passe (argon2). Rejette les comptes `PENDING_VERIFICATION`/`SUSPENDED`. Succès : émet un JWT access token (15 min, HS256) + un refresh token opaque (30 jours, stocké hashé). Chaque tentative (succès/échec) écrit un `AuditLog`.
- `RefreshToken` : fait tourner (rotate) le refresh token — l'ancien est révoqué, un nouveau couple access+refresh est émis. Présenter un token déjà révoqué est traité comme un vol : tous les refresh tokens du compte sont révoqués et un `AuditLog TOKEN_REVOKED` est écrit avant l'erreur.
- `Logout` : révoque le refresh token présenté. Idempotent (token inconnu ou déjà révoqué = pas une erreur).
- `ValidateToken` : vérifie la signature/expiration d'un JWT access token. Retourne `{valid: false}` plutôt qu'une erreur gRPC sur un token invalide — c'est un check booléen que tout autre service appellera avant chaque action protégée, pas un cas exceptionnel.
- `GetAccount` : lookup d'un compte par id, `NOT_FOUND` si absent.
- `CreateProfile` : applique la distinction perso/famille/étudiant de `01-identity.md` — `PERSO`/`ETUDIANT` sont limités à un seul profil (`FAILED_PRECONDITION` sur un deuxième), `FAMILLE` peut en créer plusieurs. Le premier profil d'un compte reçoit toujours le rôle `OWNER` ; les suivants (uniquement sur `FAMILLE`) reçoivent `KID` ou `MEMBER` selon `isKidsProfile`.
- `ListProfiles` : liste les profils d'un compte.

**Rate limiting** (protection brute-force, `01-identity.md` §"Bonnes pratiques sécurité") : `Login` (5 tentatives / 15 min) et `Register` (5 / heure), tous deux par IP client (pas par email, pour ne pas permettre à un attaquant de verrouiller le compte d'une victime). Fenêtre fixe via Redis (`INCR`+`EXPIRE`) — dépassement → `RateLimitExceededError` → gRPC `RESOURCE_EXHAUSTED`. Voir `src/domain/loginAccount.ts`/`registerAccount.ts` pour le détail des constantes, `src/infra/redisRateLimiter.ts` pour la limite connue (imprécision aux bornes de fenêtre, acceptée et documentée, pas un bug caché).

## Architecture

Le service suit une architecture hexagonale simple (cf. `services/AGENT.md`, section 3) : `/domain` ne dépend de rien d'externe (ni Prisma, ni gRPC), `/infra` implémente les ports du domaine, `/grpc` est la couche de transport qui traduit proto ↔ domaine. Le diagramme ci-dessous montre le flux de `Register` ; `VerifyEmail` (et les RPCs suivants) suivent le même schéma via leur propre fichier `domain/*.ts`.

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
| `src/domain/registerAccount.ts` | Logique métier de `Register` : validation, hash, génération du token de vérification |
| `src/domain/verifyEmail.ts` | Logique métier de `VerifyEmail` : vérifie le token, active le compte |
| `src/domain/loginAccount.ts` | Logique métier de `Login` : vérification credentials, statut du compte, émission access+refresh token, audit |
| `src/domain/refreshSession.ts` | Logique métier de `RefreshToken` : rotation, détection de réutilisation (vol) |
| `src/domain/logoutAccount.ts` | Logique métier de `Logout` : révocation idempotente |
| `src/domain/validateAccessToken.ts` | Logique métier de `ValidateToken` : vérification JWT |
| `src/domain/getAccount.ts` | Logique métier de `GetAccount` : lookup par id |
| `src/domain/createProfile.ts` | Logique métier de `CreateProfile` : limite 1-profil perso/étudiant, attribution automatique du rôle |
| `src/domain/listProfiles.ts` | Logique métier de `ListProfiles` |
| `src/domain/tokens.ts` | Génération/hash de tokens opaques (refresh, vérification email) + signature/vérification JWT (`jose`) |
| `src/domain/schemas.ts` | Schémas Zod de validation d'entrée |
| `src/domain/errors.ts` | Erreurs métier typées, mappées en codes gRPC par `identityServiceImpl.ts` |
| `src/domain/accountRepository.ts` | Port (interface) `AccountRepository` — permet de tester la logique métier sans DB |
| `src/domain/refreshTokenRepository.ts` | Port (interface) `RefreshTokenRepository` |
| `src/domain/auditLogRepository.ts` | Port (interface) `AuditLogRepository` |
| `src/domain/profileRepository.ts` | Port (interface) `ProfileRepository` |
| `src/domain/rateLimiter.ts` | Port (interface) `RateLimiter` — compteur à fenêtre fixe, `consume(key, limit, windowSeconds)` |
| `src/grpc/clientIp.ts` | Extrait l'IP client (métadonnée `x-client-ip` posée par la Gateway, sinon `call.getPeer()`) pour l'audit et le rate limiting |
| `src/infra/prismaAccountRepository.ts` | Implémentation Prisma du port `AccountRepository` |
| `src/infra/prismaRefreshTokenRepository.ts` | Implémentation Prisma du port `RefreshTokenRepository` |
| `src/infra/prismaAuditLogRepository.ts` | Implémentation Prisma du port `AuditLogRepository` |
| `src/infra/prismaProfileRepository.ts` | Implémentation Prisma du port `ProfileRepository` — upsert de `Role` par nom à la volée (pas de script de seed séparé) |
| `src/infra/prismaClient.ts` | Singleton `PrismaClient` du process |
| `src/infra/redisClient.ts` | Construit un client `ioredis` — `url` injectée (comme `identityClient.ts` côté Gateway), pas lue depuis l'env ici |
| `src/infra/redisRateLimiter.ts` | Implémentation Redis du port `RateLimiter` |
| `src/infra/logger.ts` | Logger Pino du service (via `@streaming/shared-logging`) |
| `prisma/schema.prisma` | Schéma DB complet du domaine Identity (voir ER dans `docs/01-identity.md`) |
| `prisma/migrations/` | Migrations versionnées — générées via `npm run prisma:migrate`, jamais éditées à la main |
| `tests/unit/` | Tests de `/domain` avec un repository en mémoire (pas de DB) |
| `tests/integration/` | Tests bout-en-bout : vrai PostgreSQL (Testcontainers) + vrai client gRPC |

## Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `DATABASE_URL` | Connexion PostgreSQL (Prisma) | — requis |
| `JWT_SECRET` | Secret HS256 de signature des access tokens — fail-fast au démarrage si absent | — requis |
| `REDIS_URL` | Connexion Redis (rate limiting) — fail-fast au démarrage si absent | — requis |
| `IDENTITY_GRPC_ADDRESS` | Adresse d'écoute du serveur gRPC | `0.0.0.0:50051` |

## Lancer en local

```bash
docker compose up -d postgres redis   # depuis la racine du repo
cp ../../.env.example ../../.env  # si pas déjà fait
npm run prisma:migrate           # applique les migrations
npm run build && node dist/index.js
```

## Tests

```bash
npm test              # depuis la racine, ou `npx vitest run` ici
```

- `tests/unit/` : logique `/domain` pure, repositories en mémoire partagés (`tests/unit/fakes/`) — pas de DB
- `tests/integration/register.grpc.test.ts` : cas d'erreur de `Register` (email dupliqué, étudiant sans email universitaire)
- `tests/integration/authFlow.grpc.test.ts` : parcours complet du cycle de compte (register → verify → login → refresh → logout → ...), un seul PostgreSQL + Redis Testcontainers partagés, grandit au fil des sous-features — vrai PostgreSQL/Redis éphémères + vrai client gRPC, aucune donnée mockée. Le bloc `rate limiting` utilise la métadonnée `x-client-ip` avec une IP factice par test pour isoler son budget de celui des autres tests du fichier (une deuxième instance de client gRPC ne suffit pas : `@grpc/grpc-js` réutilise la même connexion sous-jacente pour une même cible)

## Régénérer les stubs gRPC

```bash
npm run proto:gen   # protoc + ts-proto, source: /proto/identity.proto
```
