-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CHECK_IN';

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false;
