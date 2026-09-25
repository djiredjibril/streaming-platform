# Changelog — Identity Service

## Unreleased

- feat: `Register` endpoint (gRPC) — validation Zod, hash argon2id, comptes créés `PENDING_VERIFICATION` sans émission de token ; schéma Prisma initial (Account, StudentVerification, Profile, Role, ProfileRole, RefreshToken, AuditLog)
- feat: `VerifyEmail` endpoint (gRPC) — active un compte `PENDING_VERIFICATION` via le token mocké renvoyé par `Register` (V1, pas d'envoi d'email réel) ; migration `add_email_verification`
- feat: `Login` endpoint (gRPC) — JWT access token (15 min) + refresh token opaque (30 jours, stocké hashé), rejet des comptes non vérifiés/suspendus, audit `LOGIN_SUCCESS`/`LOGIN_FAILED` ; nouvelle variable d'env `JWT_SECRET` (fail-fast)
- feat: `RefreshToken` endpoint (gRPC) — rotation avec détection de réutilisation (vol de token détecté = révocation de tous les refresh tokens du compte + audit `TOKEN_REVOKED`)
- feat: `Logout` endpoint (gRPC) — révocation idempotente du refresh token présenté
- feat: `ValidateToken`/`GetAccount` endpoints (gRPC) — vérification JWT et lookup de compte, prêts à être appelés par les autres domaines (Billing, Delivery, Social) et par la Gateway
- feat: `CreateProfile`/`ListProfiles` endpoints (gRPC) — active les tables `Profile`/`Role`/`ProfileRole` du schéma initial, jusqu'ici inexploitées ; limite d'un profil pour `PERSO`/`ETUDIANT`, rôle `OWNER` automatique sur le premier profil
- feat: rate limiting sur `Login`/`Register` (Redis, fenêtre fixe, par IP) — protection brute-force notée dès la spec Phase 1, fermée après trois reports ; nouvelle variable d'env `REDIS_URL` (fail-fast)
- feat: propagation du `correlation_id` (métadonnée gRPC `x-correlation-id`, sinon UUID généré) — chaque handler avec un log métier utilise un logger enfant Pino dédié ; dernier item du gap de traçabilité noté dès `Register`
- feat: rôle admin minimal (`Account.isAdmin`, migration `add_account_is_admin`) — aucune mutation self-service, promotion uniquement par écriture DB directe (documentée) ; embarqué dans le claim JWT à `Login`/`RefreshToken` et exposé via `ValidateTokenResponse.is_admin`/`Account.is_admin`, prérequis pour autoriser les écritures Catalog (`createTitle`)
