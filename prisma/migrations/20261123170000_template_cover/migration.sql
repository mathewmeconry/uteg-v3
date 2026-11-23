-- AlterTable
ALTER TABLE "asset" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "templateId" TEXT;

-- CreateIndex
CREATE INDEX "asset_templateId_idx" ON "asset"("templateId");

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ranking_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
