-- AlterTable
ALTER TABLE "competition" ADD COLUMN     "keepHandwriting" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "scanned_grade" ADD COLUMN     "cellHeight" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cellWidth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cells" BYTEA[] DEFAULT ARRAY[]::BYTEA[];

-- CreateTable
CREATE TABLE "handwriting_sample" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "ink" BYTEA NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "read" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handwriting_sample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "handwriting_sample_competitionId_idx" ON "handwriting_sample"("competitionId");

-- AddForeignKey
ALTER TABLE "handwriting_sample" ADD CONSTRAINT "handwriting_sample_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
