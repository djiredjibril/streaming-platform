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

## Lancer les services (Identity + Catalog + Gateway)

Une fois l'infra démarrée (`docker compose up -d`) et les dépendances installées :

```bash
npm run prisma:migrate:identity   # applique les migrations Identity (une seule fois / après un pull avec nouvelle migration)
npm run prisma:migrate:catalog    # applique les migrations Catalog (idem)

# Terminal 1
npm run start:identity    # build + démarre le serveur gRPC Identity sur 0.0.0.0:50051

# Terminal 2
npm run start:catalog     # build + démarre le serveur gRPC Catalog sur 0.0.0.0:50052

# Terminal 3
npm run start:gateway     # build + démarre le serveur HTTP Gateway sur localhost:3000
```

Vérifier que ça répond :

```bash
curl -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"correct-horse-battery","accountType":"PERSO"}'
```

Pour tester le flux complet (register → verify → login → me → refresh → logout) sans taper les requêtes à la main, importer la collection Postman : voir `services/gateway/README.md`, section "Tester manuellement avec Postman".

## Arrêter l'environnement

```bash
docker compose down
```

## Notes d'infra locale

### PostgreSQL (`postgres:16-alpine`)
- Port `5432`, credentials par défaut `streaming` / `streaming` / DB `streaming` (surchargeables via `.env` : `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`)
- Donnée persistée dans le volume nommé `postgres_data`
- Healthcheck : `pg_isready`

### Redis (`redis:7-alpine`)
- Port `6379`, pas d'auth en local (pas de `requirepass`) — à activer si un jour exposé au-delà de `localhost`
- Donnée persistée dans le volume nommé `redis_data` (utile pour ne pas perdre les jobs BullMQ entre redémarrages)
- Healthcheck : `redis-cli ping`

### MinIO (`quay.io/minio/minio:latest`)
- Port `9000` (API S3) + `9001` (console web), credentials par défaut `minioadmin` / `minioadmin` (surchargeables via `.env` : `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`)
- Donnée persistée dans le volume nommé `minio_data`
- Healthcheck : `curl http://localhost:9000/minio/health/live`
- **Piège rencontré** : l'image `minio/minio` sur Docker Hub renvoie `pull access denied` — MinIO a déplacé la distribution de ses images officielles vers `quay.io/minio/minio`. Le `docker-compose.yml` pointe donc vers `quay.io`, pas Docker Hub.

### Vérifier que tout tourne

```bash
docker compose exec postgres pg_isready -U streaming
docker compose exec redis redis-cli ping
curl -sf http://localhost:9000/minio/health/live && echo OK
```
