# Gateway Service

Seul service que le frontend appelle directement. Expose **REST** pour l'authentification/gestion de compte et **GraphQL** pour tout le reste (Catalog, Social, Discovery — pas encore construits). Traduit chaque requête en appel(s) gRPC vers les services internes ; ne possède aucune donnée elle-même et ne contient aucune logique métier. Voir `docs/00-OVERVIEW.md`, "Les trois styles d'API", pour la justification de ce découpage REST/GraphQL/gRPC.

## Implémenté

Le contrat REST complet est documenté dans `docs/01-identity.md`, section "Endpoints exposés au frontend". Toutes les routes valident la forme du corps (Zod) puis appellent le RPC `IdentityService` correspondant — aucune logique métier ici, seulement de la traduction proto ↔ HTTP et le mapping erreurs gRPC → codes HTTP (`mapGrpcError` dans `http/routes/auth.ts`).

- `POST /auth/register` → `Register`
- `POST /auth/verify-email` → `VerifyEmail`
- `POST /auth/login` → `Login` — pose le refresh token en cookie `httpOnly` (`Path=/auth`, `sameSite=lax`) ; le refresh token n'apparaît jamais dans le JSON (`apps/web/AGENT.md`)
- `POST /auth/refresh` (lit le cookie) → `RefreshToken` — pose un nouveau cookie ; en cas d'erreur (ex: vol détecté), le cookie est effacé
- `POST /auth/logout` (lit le cookie) → `Logout` — efface le cookie, `204`
- `GET /auth/me` (header `Authorization: Bearer <token>`) → `ValidateToken` puis `GetAccount`

`login`/`refresh` transmettent aussi l'IP réelle du client en métadonnée gRPC `x-client-ip` (`clientIpMetadata()`) pour que l'`AuditLog` d'Identity reflète le vrai client plutôt que l'adresse de la Gateway.

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
| `src/http/routes/auth.ts` | Toutes les routes `/auth/*` — voir "Implémenté" ci-dessus |
| `src/http/schemas.ts` | Schémas Zod des corps de requête (validation de forme, pas de règles métier — Identity revalide tout) |
| `src/grpc/identityClient.ts` | Client gRPC vers `IdentityService` + `callUnary()` (promisification générique réutilisée par toutes les routes) |
| `src/grpc/generated/identity.ts` | **Généré** par `npm run proto:gen` depuis `/proto/identity.proto` — ne pas éditer à la main |
| `src/infra/logger.ts` | Logger Pino du service (via `@streaming/shared-logging`) |
| `tests/unit/` | Routes testées via `fastify.inject`, client gRPC mocké (fake générique couvrant n'importe quelle méthode) |
| `tests/integration/authFlow.http.test.ts` | Bout-en-bout réel : vrai serveur gRPC Identity (Testcontainers Postgres) + vraies requêtes HTTP sur la Gateway, cycle de session complet |

## Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `IDENTITY_GRPC_ADDRESS` | Adresse du serveur gRPC Identity à appeler | `127.0.0.1:50051` |
| `GATEWAY_HTTP_PORT` | Port d'écoute HTTP | `3000` |

## Lancer en local

```bash
# Terminal 1 : Identity doit tourner (cf. services/identity/README.md)
# Terminal 2 :
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
npm run proto:gen   # protoc + ts-proto, source: /proto/identity.proto
```
