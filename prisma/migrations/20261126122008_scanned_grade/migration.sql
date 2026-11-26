-- CreateTable
CREATE TABLE "scanned_grade" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "apparatus" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "attempts" INTEGER[],
    "confidence" DOUBLE PRECISION NOT NULL,
    "image" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scanned_grade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scanned_grade_entryId_apparatus_key" ON "scanned_grade"("entryId", "apparatus");

-- AddForeignKey
ALTER TABLE "scanned_grade" ADD CONSTRAINT "scanned_grade_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
