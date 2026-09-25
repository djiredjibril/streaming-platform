-- CreateEnum
CREATE TYPE "TitleType" AS ENUM ('MOVIE', 'SERIES', 'SHORT');

-- CreateEnum
CREATE TYPE "ContentRating" AS ENUM ('G', 'PG', 'PG_13', 'R', 'NC_17', 'UNRATED');

-- CreateEnum
CREATE TYPE "TitleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "titles" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "TitleType" NOT NULL,
    "original_title" TEXT NOT NULL,
    "synopsis" TEXT NOT NULL,
    "release_year" INTEGER NOT NULL,
    "rating" "ContentRating" NOT NULL,
    "runtime_minutes" INTEGER,
    "poster_url" TEXT,
    "backdrop_url" TEXT,
    "status" "TitleStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "titles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "titles_slug_key" ON "titles"("slug");
