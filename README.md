# Streaming Platform

Plateforme de streaming vidéo (films, séries, shorts) en monorepo. Voir `/docs` pour les specs de domaine, `WORKFLOW.md` pour la boucle de développement, et `services/AGENT.md` / `apps/web/AGENT.md` pour les guides d'implémentation backend/frontend.

## Structure

```
/services         <- un service par domaine (identity, billing, catalog, media-pipeline, delivery, social, discovery, gateway)
/apps/web         <- frontend
/packages         <- code partagé (types, logging)
/proto            <- fichiers .proto partagés entre services
docker-compose.yml <- Postgres, Redis, MinIO en local
```

## Démarrage local

1. Copier `.env.example` en `.env` et ajuster si besoin
2. Démarrer l'infra locale :
   ```bash
   docker compose up -d
   ```
3. Installer les dépendances :
   ```bash
   npm install
   ```
4. Vérifier que tout compile :
   ```bash
   npm run typecheck
   npm run lint
   ```

## Arrêter l'environnement

```bash
docker compose down
```
