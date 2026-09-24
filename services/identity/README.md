# Identity Service

Source de vérité pour l'authentification et l'état des comptes. Voir `/docs/01-identity.md` pour le modèle de données complet et `/proto/identity.proto` pour le contrat gRPC.

## Implémenté

- `Register` : crée un `Account` (+ `StudentVerification` si `ETUDIANT`) avec un mot de passe hashé en argon2id. L'account est créé `PENDING_VERIFICATION` et **aucun token n'est émis** — `access_token`/`refresh_token` reviennent vides tant qu'une étape de vérification (à venir) n'a pas activé le compte. Voir le commentaire sur `rpc Register` dans le `.proto`.

## Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `DATABASE_URL` | Connexion PostgreSQL (Prisma) | — requis |
| `IDENTITY_GRPC_ADDRESS` | Adresse d'écoute du serveur gRPC | `0.0.0.0:50051` |

## Lancer en local

```bash
docker compose up -d postgres   # depuis la racine du repo
cp ../../.env.example ../../.env  # si pas déjà fait
npm run prisma:migrate           # applique les migrations
npm run build && node dist/index.js
```

## Tests

```bash
npm test              # depuis la racine, ou `npx vitest run` ici
```

- `tests/unit/registerAccount.test.ts` : logique domaine pure, repository en mémoire (pas de DB)
- `tests/integration/register.grpc.test.ts` : Testcontainers (vrai PostgreSQL éphémère) + vrai client gRPC — aucune donnée mockée

## Régénérer les stubs gRPC

```bash
npm run proto:gen   # protoc + ts-proto, source: /proto/identity.proto
```
