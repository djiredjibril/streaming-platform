# Gateway Service

Seul service que le frontend appelle directement. Expose **REST** pour l'authentification/gestion de compte et **GraphQL** pour tout le reste (Catalog implémenté ; Social, Discovery pas encore construits). Traduit chaque requête en appel(s) gRPC vers les services internes ; ne possède aucune donnée elle-même et ne contient aucune logique métier. Voir `docs/00-OVERVIEW.md`, "Les trois styles d'API", pour la justification de ce découpage REST/GraphQL/gRPC.

## Implémenté

Le contrat REST complet est documenté dans `docs/01-identity.md`, section "Endpoints exposés au frontend". Toutes les routes valident la forme du corps (Zod) puis appellent le RPC `IdentityService` correspondant — aucune logique métier ici, seulement de la traduction proto ↔ HTTP et le mapping erreurs gRPC → codes HTTP (`mapGrpcError` dans `http/routes/auth.ts`).

- `POST /auth/register` → `Register`
- `POST /auth/verify-email` → `VerifyEmail`
- `POST /auth/login` → `Login` — pose le refresh token en cookie `httpOnly` (`Path=/auth`, `sameSite=lax`) ; le refresh token n'apparaît jamais dans le JSON (`apps/web/AGENT.md`)
- `POST /auth/refresh` (lit le cookie) → `RefreshToken` — pose un nouveau cookie ; en cas d'erreur (ex: vol détecté), le cookie est effacé
- `POST /auth/logout` (lit le cookie) → `Logout` — efface le cookie, `204`
- `GET /auth/me` (header `Authorization: Bearer <token>`) → `ValidateToken` puis `GetAccount`
- `POST /auth/profiles` `{displayName, isKidsProfile}` (Bearer requis) → `CreateProfile`
- `GET /auth/profiles` (Bearer requis) → `ListProfiles`

`login`/`refresh`/`register` transmettent aussi l'IP réelle du client en métadonnée gRPC `x-client-ip` pour que l'`AuditLog` et le rate limiter d'Identity reflètent le vrai client plutôt que l'adresse de la Gateway. `mapGrpcError` traduit un `RESOURCE_EXHAUSTED` (limite dépassée) en `429`.

**Correlation ID** (`services/AGENT.md` §5) : `request.id` de Fastify est redéfini (`genReqId` dans `http/server.ts`) pour réutiliser un header entrant `x-correlation-id` si présent, sinon générer un UUID — et `requestIdLogLabel: 'correlation_id'` renomme le champ dans les logs d'accès automatiques de Fastify. `requestMetadata()` (`http/routes/auth.ts`, remplace l'ancien `clientIpMetadata()`) pose cette valeur en métadonnée gRPC `x-correlation-id` sur **tous** les appels `callUnary` vers Identity (les 9 appels des 7 routes, pas seulement login/register/refresh) — permet de relier dans les logs une requête HTTP entrante à tout ce qu'elle déclenche côté Identity (`grpc/correlationId.ts` côté Identity). `x-client-ip` reste posé seulement sur register/login/refresh, via le même helper (`includeClientIp: true`).

**`/auth/profiles` n'accepte jamais d'`accountId` du client** — il est dérivé du token via `requireAccountId()` (Bearer → `ValidateToken` → `accountId`), la même logique que `/auth/me`, extraite en helper partagé. Accepter un `accountId` du corps de la requête permettrait à n'importe quel compte authentifié de créer/lister des profils sur le compte de quelqu'un d'autre (IDOR) — voir le test "n'accepte jamais d'accountId du client" dans `tests/integration/authFlow.http.test.ts`.

### GraphQL (`/graphql`) — Catalog

Premier domaine exposé en GraphQL sur la Gateway (`graphql-yoga`, monté sur Fastify — voir `src/graphql/server.ts`), suivant le même principe que REST/Identity : la Gateway reste le seul point d'entrée client, elle traduit vers gRPC en interne (`grpc/catalogClient.ts`), aucune logique métier ni accès DB direct ici.

- `Query.title(slug): Title` — `null` (pas une erreur) pour tout ce que `CatalogService.GetTitleBySlug` renvoie en `NOT_FOUND` : un slug inconnu et un titre réel non publié sont indistinguables à ce niveau aussi. Expose `isPlayable`/`videoUrl`, dérivés du statut du `MediaAsset` (`docs/03-catalog.md`'s `Episode.isPlayable`, appliqué ici au niveau `Title` tant qu'il n'y a pas d'`Episode`)
- `Mutation.createTitle(input): Title!` / `attachMediaAsset(input): Title!` / `publishTitle(id): Title!` — les 3 nécessitent un token d'accès **admin** (`Account.isAdmin` via `IdentityService.ValidateToken`, vérifié dans `requireAdmin()` avant même d'appeler Catalog) ; erreurs typées (`extensions.code`: `UNAUTHENTICATED`/`FORBIDDEN`/`BAD_USER_INPUT`/`ALREADY_EXISTS`/`NOT_FOUND`/`FAILED_PRECONDITION`/`INTERNAL_SERVER_ERROR`), jamais l'erreur gRPC brute exposée au client (`services/AGENT.md` §8)

**Détail d'intégration Fastify + Yoga** : la route `/graphql` utilise `yoga.fetch(url, {method, headers, body}, context)` — construit à partir de `request.body` déjà parsé par Fastify — plutôt que `yoga.handle(request.raw, reply.raw)`. Ce dernier lit le corps depuis le flux Node brut, déjà consommé par le parseur JSON de Fastify au moment où le handler s'exécute (bug réel rencontré en écrivant les tests de cette feature : chaque requête échouait avec "Unexpected end of JSON input").

## Architecture

```
Requête HTTP (ex: POST /auth/login)
        │
        ▼
  http/server.ts            <- instance Fastify, plugin @fastify/cookie, enregistre les routes
        │
        ▼
  http/routes/auth.ts        <- valide le corps (Zod), appelle le client gRPC via callUnary(),
        │                        pose/lit le cookie refresh_token, mappe erreurs gRPC -> codes HTTP
        ▼
  grpc/identityClient.ts     <- client IdentityService (gRPC) + callUnary() (promisification générique)
        │
        ▼
  services/identity (autre service, appelé via le réseau)
```

### Table des fichiers

| Fichier | Rôle |
|---|---|
| `src/index.ts` | Point d'entrée process : démarre le serveur HTTP |
| `src/http/server.ts` | Construit l'instance Fastify (+ plugin `@fastify/cookie`), injecte les dépendances |
| `src/http/routes/auth.ts` | Toutes les routes `/auth/*` — voir "Implémenté" ci-dessus. `requireAccountId()` (Bearer → `ValidateToken`) est partagé par `/auth/me` et `/auth/profiles`. `requestMetadata()` pose `x-correlation-id` (+ `x-client-ip` en option) sur chaque appel gRPC |
| `src/http/schemas.ts` | Schémas Zod des corps de requête (validation de forme, pas de règles métier — Identity revalide tout) |
| `src/grpc/identityClient.ts` | Client gRPC vers `IdentityService` |
| `src/grpc/catalogClient.ts` | Client gRPC vers `CatalogService` |
| `src/grpc/callUnary.ts` | Promisification générique d'un appel gRPC unaire, réutilisée par les routes REST et les resolvers GraphQL |
| `src/grpc/generated/identity.ts` | **Généré** par `npm run proto:gen:identity` depuis `/proto/identity.proto` — ne pas éditer à la main |
| `src/grpc/generated/catalog.ts` | **Généré** par `npm run proto:gen:catalog` depuis `/proto/catalog.proto` — ne pas éditer à la main |
| `src/graphql/schema.ts` | SDL GraphQL (V1 : domaine Catalog uniquement) |
| `src/graphql/resolvers.ts` | Resolvers `Query`/`Mutation` — traduisent GraphQL ↔ gRPC, `requireAdmin()` pour `createTitle` |
| `src/graphql/server.ts` | Monte GraphQL Yoga sur Fastify à `/graphql` |
| `src/infra/logger.ts` | Logger Pino du service (via `@streaming/shared-logging`) |
| `tests/unit/` | Routes/resolvers testés via `fastify.inject`, clients gRPC mockés (fakes génériques) |
| `tests/integration/authFlow.http.test.ts` | Bout-en-bout REST réel : vrai serveur gRPC Identity (Testcontainers Postgres) + vraies requêtes HTTP, cycle de session complet |
| `tests/integration/catalogFlow.http.test.ts` | Bout-en-bout GraphQL réel : vrais serveurs gRPC Identity + Catalog (deux Testcontainers Postgres distincts) + vraies requêtes GraphQL |

## Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `IDENTITY_GRPC_ADDRESS` | Adresse du serveur gRPC Identity à appeler | `127.0.0.1:50051` |
| `CATALOG_GRPC_ADDRESS` | Adresse du serveur gRPC Catalog à appeler | `127.0.0.1:50052` |
| `GATEWAY_HTTP_PORT` | Port d'écoute HTTP | `3000` |

## Lancer en local

```bash
# Terminal 1 : Identity doit tourner (cf. services/identity/README.md)
# Terminal 2 : Catalog doit tourner (cf. services/catalog/README.md)
# Terminal 3 :
npm run build && node dist/index.js
```

## Tester manuellement avec Postman

Une collection couvrant le cycle de session complet vit dans `/postman` :

1. Importer `postman/streaming-platform.postman_collection.json` (Postman : File → Import) et `postman/streaming-platform.postman_environment.json`, sélectionner l'environnement "Streaming Platform — Local"
2. S'assurer qu'Identity et la Gateway tournent en local (`baseUrl` par défaut : `http://localhost:3000`)
3. Lancer le dossier "Identity — full session flow" dans l'ordre (Runner ou requête par requête) : `Register` → `Verify email` → `Login` → `Me` → `Refresh` → `Logout`. Chaque requête extrait ce dont la suivante a besoin (`verificationToken`, `accessToken`) via son script de test — le cookie `refresh_token` est géré automatiquement par le cookie jar de Postman, rien à copier à la main

## Tests

```bash
npm test   # depuis la racine, ou `npx vitest run` ici
```

**Note sur `tests/integration/`** : ce test importe `buildIdentityServer` compilé depuis `@streaming/identity` (`services/identity` doit avoir été buildé — `npm run build` dans ce service) pour démarrer un vrai serveur Identity en process, plutôt que de mocker gRPC. C'est un couplage de test délibéré entre deux services normalement isolés (aucun autre fichier de la Gateway ne dépend d'Identity) : l'objectif est de vérifier la chaîne complète HTTP → gRPC → PostgreSQL sans rien simuler.

## Régénérer les stubs gRPC

```bash
npm run proto:gen   # les deux : identity.proto + catalog.proto
npm run proto:gen:identity
npm run proto:gen:catalog
```
