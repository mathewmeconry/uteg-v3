-- CreateTable
CREATE TABLE "template_assignment" (
    "competitionId" TEXT NOT NULL,
    "sex" "Sex" NOT NULL,
    "category" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,

    CONSTRAINT "template_assignment_pkey" PRIMARY KEY ("competitionId","sex","category")
);

-- CreateIndex
CREATE INDEX "template_assignment_templateId_idx" ON "template_assignment"("templateId");

-- AddForeignKey
ALTER TABLE "template_assignment" ADD CONSTRAINT "template_assignment_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_assignment" ADD CONSTRAINT "template_assignment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ranking_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
