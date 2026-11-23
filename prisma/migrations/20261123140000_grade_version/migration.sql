-- AlterTable
ALTER TABLE "grade" ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;
