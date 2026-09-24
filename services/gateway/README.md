# Gateway Service

Seul service que le frontend appelle directement. Expose **REST** pour l'authentification/gestion de compte et **GraphQL** pour tout le reste (Catalog, Social, Discovery — pas encore construits). Traduit chaque requête en appel(s) gRPC vers les services internes ; ne possède aucune donnée elle-même et ne contient aucune logique métier. Voir `docs/00-OVERVIEW.md`, "Les trois styles d'API", pour la justification de ce découpage REST/GraphQL/gRPC.

## Implémenté

- `POST /auth/register` : valide la forme du corps (Zod), appelle `IdentityService.Register` en gRPC, traduit la réponse/erreur en JSON/code HTTP. Voir `docs/01-identity.md`, section "Endpoints exposés au frontend", pour le contrat REST complet (routes futures incluses).

## Architecture

```
Requête HTTP (POST /auth/register)
        │
        ▼
  http/server.ts            <- instance Fastify, enregistre les routes
        │
        ▼
  http/routes/auth.ts        <- valide le corps (Zod), appelle le client gRPC,
        │                        mappe erreurs gRPC -> codes HTTP
        ▼
  grpc/identityClient.ts     <- client IdentityService (gRPC)
        │
        ▼
  services/identity (autre service, appelé via le réseau)
```

### Table des fichiers

| Fichier | Rôle |
|---|---|
| `src/index.ts` | Point d'entrée process : démarre le serveur HTTP |
| `src/http/server.ts` | Construit l'instance Fastify, injecte les dépendances |
| `src/http/routes/auth.ts` | Handler `POST /auth/register` |
| `src/http/schemas.ts` | Schéma Zod du corps de requête (validation de forme, pas de règles métier — Identity revalide tout) |
| `src/grpc/identityClient.ts` | Construit le client gRPC vers `IdentityService` |
| `src/grpc/generated/identity.ts` | **Généré** par `npm run proto:gen` depuis `/proto/identity.proto` — ne pas éditer à la main |
| `src/infra/logger.ts` | Logger Pino du service (via `@streaming/shared-logging`) |
| `tests/unit/` | Route testée via `fastify.inject`, client gRPC mocké |
| `tests/integration/` | Bout-en-bout réel : vrai serveur gRPC Identity (Testcontainers Postgres) + vraie requête HTTP sur la Gateway |

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

## Tests

```bash
npm test   # depuis la racine, ou `npx vitest run` ici
```

**Note sur `tests/integration/`** : ce test importe `buildIdentityServer` compilé depuis `@streaming/identity` (`services/identity` doit avoir été buildé — `npm run build` dans ce service) pour démarrer un vrai serveur Identity en process, plutôt que de mocker gRPC. C'est un couplage de test délibéré entre deux services normalement isolés (aucun autre fichier de la Gateway ne dépend d'Identity) : l'objectif est de vérifier la chaîne complète HTTP → gRPC → PostgreSQL sans rien simuler.

## Régénérer les stubs gRPC

```bash
npm run proto:gen   # protoc + ts-proto, source: /proto/identity.proto
```
