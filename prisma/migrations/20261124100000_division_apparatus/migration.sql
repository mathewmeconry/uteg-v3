-- DropForeignKey
ALTER TABLE "division_progress" DROP CONSTRAINT "division_progress_divisionId_fkey";

-- DropForeignKey
ALTER TABLE "entry" DROP CONSTRAINT "entry_lineupId_fkey";

-- DropForeignKey
ALTER TABLE "lineup" DROP CONSTRAINT "lineup_divisionId_fkey";

-- DropIndex
DROP INDEX "entry_divisionId_idx";

-- DropIndex
DROP INDEX "entry_lineupId_position_idx";

-- AlterTable
ALTER TABLE "entry" DROP COLUMN "lineupId",
ADD COLUMN     "startApparatus" TEXT;

-- DropTable
DROP TABLE "lineup";

-- RenameTable
ALTER TABLE "division_progress" RENAME TO "division_apparatus";
ALTER TABLE "division_apparatus" RENAME CONSTRAINT "division_progress_pkey" TO "division_apparatus_pkey";

-- CreateIndex
CREATE INDEX "entry_divisionId_startApparatus_position_idx" ON "entry"("divisionId", "startApparatus", "position");

-- AddForeignKey
ALTER TABLE "division_apparatus" ADD CONSTRAINT "division_apparatus_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "division"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry" ADD CONSTRAINT "entry_divisionId_startApparatus_fkey" FOREIGN KEY ("divisionId", "startApparatus") REFERENCES "division_apparatus"("divisionId", "apparatus") ON DELETE SET NULL ON UPDATE CASCADE;
