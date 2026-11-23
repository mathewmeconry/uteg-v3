-- AlterTable
ALTER TABLE "ranking_template" ADD COLUMN     "coverId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ranking_template_coverId_key" ON "ranking_template"("coverId");

-- AddForeignKey
ALTER TABLE "ranking_template" ADD CONSTRAINT "ranking_template_coverId_fkey" FOREIGN KEY ("coverId") REFERENCES "asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
