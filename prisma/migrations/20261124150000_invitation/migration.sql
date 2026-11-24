-- CreateTable
CREATE TABLE "invitation" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invitation_email_idx" ON "invitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_competitionId_email_key" ON "invitation"("competitionId", "email");

-- Registering used to sign in without verifying the address.
DELETE FROM "session" USING "user"
WHERE "session"."userId" = "user"."id" AND NOT "user"."emailVerified";

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
