# Changelog — Identity Service

## Unreleased

- feat: `Register` endpoint (gRPC) — validation Zod, hash argon2id, comptes créés `PENDING_VERIFICATION` sans émission de token ; schéma Prisma initial (Account, StudentVerification, Profile, Role, ProfileRole, RefreshToken, AuditLog)
