-- AlterTable: generated (STORED) tsvector, weighted original_title (A) >
-- synopsis (B) — Postgres recomputes it automatically on every INSERT/UPDATE,
-- CreateTitle never has to write to it itself. Prisma can't express a
-- generated column, hence the raw SQL (see schema.prisma's Unsupported comment).
ALTER TABLE "titles" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("original_title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("synopsis", '')), 'B')
  ) STORED;

-- CreateIndex: GIN index for full-text search (03-catalog.md, "Recherche et indexation").
CREATE INDEX "titles_search_vector_idx" ON "titles" USING GIN ("search_vector");
