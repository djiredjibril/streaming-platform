# Changelog — Gateway Service

## Unreleased

- feat: `POST /auth/register` — proxy REST vers `IdentityService.Register` (gRPC), validation Zod de forme, mapping des erreurs gRPC en codes HTTP (INVALID_ARGUMENT→400, ALREADY_EXISTS→409, autre→500)
