# Changelog — Gateway Service

## Unreleased

- feat: `POST /auth/register` — proxy REST vers `IdentityService.Register` (gRPC), validation Zod de forme, mapping des erreurs gRPC en codes HTTP (INVALID_ARGUMENT→400, ALREADY_EXISTS→409, autre→500)
- feat: surface REST `/auth/*` complète — `verify-email`, `login` (cookie httpOnly), `refresh` (rotation), `logout`, `me` (Bearer + ValidateToken/GetAccount) ; ajout de `@fastify/cookie` et de `callUnary()` (promisification gRPC générique)
- feat: `POST`/`GET /auth/profiles` — `CreateProfile`/`ListProfiles`, `accountId` toujours dérivé du token (`requireAccountId()`, jamais accepté du client — protection IDOR)
- feat: `/auth/register` transmet l'IP réelle du client (comme `login`/`refresh` déjà) pour le rate limiting côté Identity ; `RESOURCE_EXHAUSTED` → `429`
- feat: propagation du `correlation_id` — `genReqId`/`requestIdLogLabel` (Fastify) font de `request.id` le correlation_id (réutilise le header `x-correlation-id` entrant, sinon UUID) ; `requestMetadata()` remplace `clientIpMetadata()` et pose `x-correlation-id` sur les 9 appels `callUnary` des 7 routes (au lieu de 3 auparavant), dernier item du gap de traçabilité noté dès `Register` côté Identity
- feat: GraphQL (`graphql-yoga`) monté à `/graphql`, premier domaine exposé : `Query.title(slug)` (Catalog) et `Mutation.createTitle` (admin uniquement, `requireAdmin()` via `IdentityService.ValidateToken`/`Account.isAdmin`) ; `grpc/catalogClient.ts` ajouté, `callUnary()` extrait de `identityClient.ts` (n'était pas spécifique à Identity) ; `x-correlation-id` propagé sur les appels gRPC des resolvers comme pour les routes REST
