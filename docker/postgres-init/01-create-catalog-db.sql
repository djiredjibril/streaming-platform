-- Catalog gets its own logical database on the shared local Postgres
-- instance (services/AGENT.md §1.3: no cross-service DB access). Runs once,
-- only on first container init (docker-entrypoint-initdb.d semantics) — see
-- services/catalog/README.md if the postgres_data volume already exists
-- from before this file was added.
CREATE DATABASE catalog;
