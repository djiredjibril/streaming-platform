# Changelog — Catalog Service

## Unreleased

- feat: `CreateTitle`/`GetTitleBySlug` (gRPC) — V1 scope limité à `Title` (Genre/Season/Episode/MediaAsset/Cast en features séparées à venir) ; slug dérivé de `originalTitle`+`releaseYear`, collision rejetée (pas de suffixe auto) ; `GetTitleBySlug` ne renvoie jamais un titre non `PUBLISHED` (`NOT_FOUND` pour DRAFT/ARCHIVED comme pour un slug inconnu) ; `CreateTitle` fait confiance à la Gateway pour la vérification admin (pas de revalidation de token ici)
- chore: base de données PostgreSQL dédiée (`catalog`, `docker/postgres-init/`), client Prisma généré dans un `node_modules` local au service pour éviter une collision avec celui d'Identity dans le monorepo npm workspaces
