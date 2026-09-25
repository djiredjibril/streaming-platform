# Changelog — Catalog Service

## Unreleased

- feat: `CreateTitle`/`GetTitleBySlug` (gRPC) — V1 scope limité à `Title` (Genre/Season/Episode/MediaAsset/Cast en features séparées à venir) ; slug dérivé de `originalTitle`+`releaseYear`, collision rejetée (pas de suffixe auto) ; `GetTitleBySlug` ne renvoie jamais un titre non `PUBLISHED` (`NOT_FOUND` pour DRAFT/ARCHIVED comme pour un slug inconnu) ; `CreateTitle` fait confiance à la Gateway pour la vérification admin (pas de revalidation de token ici)
- chore: base de données PostgreSQL dédiée (`catalog`, `docker/postgres-init/`), client Prisma généré hors de `node_modules` (`generated/prisma-client/`) pour éviter une collision avec celui d'Identity dans le monorepo npm workspaces
- feat: `AttachMediaAsset`/`PublishTitle` (gRPC) — ferme le gap Phase 1 (docs/00-OVERVIEW.md) : un `Title` peut enfin devenir réellement regardable. `MediaAsset` statique (un par titre en V1, pas d'upload/transcodage réel) ; `PublishTitle` refuse (`FAILED_PRECONDITION`) sans asset `READY`
- feat: `Genre` — `CreateTitle` accepte des noms de genre (triés/dédupliqués, max 10), upsertés par nom (`Genre`/`TitleGenre` many-to-many) ; `Title.genres` exposé sur toutes les lectures
- feat: `BrowseTitles` (gRPC, public) — pagination par curseur `(created_at, id)`, filtres `genre`/`type`, ne renvoie jamais un titre non `PUBLISHED`
