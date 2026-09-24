# Changelog — Identity Service

## Unreleased

- feat: `Register` endpoint (gRPC) — validation Zod, hash argon2id, comptes créés `PENDING_VERIFICATION` sans émission de token ; schéma Prisma initial (Account, StudentVerification, Profile, Role, ProfileRole, RefreshToken, AuditLog)
- feat: `VerifyEmail` endpoint (gRPC) — active un compte `PENDING_VERIFICATION` via le token mocké renvoyé par `Register` (V1, pas d'envoi d'email réel) ; migration `add_email_verification`
