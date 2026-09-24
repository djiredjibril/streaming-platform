# Changelog — Gateway Service

## Unreleased

- feat: `POST /auth/register` — proxy REST vers `IdentityService.Register` (gRPC), validation Zod de forme, mapping des erreurs gRPC en codes HTTP (INVALID_ARGUMENT→400, ALREADY_EXISTS→409, autre→500)
- feat: surface REST `/auth/*` complète — `verify-email`, `login` (cookie httpOnly), `refresh` (rotation), `logout`, `me` (Bearer + ValidateToken/GetAccount) ; ajout de `@fastify/cookie` et de `callUnary()` (promisification gRPC générique)
- feat: `POST`/`GET /auth/profiles` — `CreateProfile`/`ListProfiles`, `accountId` toujours dérivé du token (`requireAccountId()`, jamais accepté du client — protection IDOR)
- feat: `/auth/register` transmet l'IP réelle du client (comme `login`/`refresh` déjà) pour le rate limiting côté Identity ; `RESOURCE_EXHAUSTED` → `429`
