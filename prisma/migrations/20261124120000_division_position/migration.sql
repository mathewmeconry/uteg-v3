-- AlterTable
ALTER TABLE "division" ADD COLUMN "position" INTEGER;

-- Existing divisions in the order they were created.
UPDATE "division" SET "position" = "ordered"."position"
FROM (
  SELECT "division"."id", ROW_NUMBER() OVER (
    PARTITION BY "contest"."competitionId", "division"."ground"
    ORDER BY "division"."createdAt", "division"."id"
  ) AS "position"
  FROM "division" JOIN "contest" ON "contest"."id" = "division"."contestId"
) AS "ordered"
WHERE "ordered"."id" = "division"."id";

ALTER TABLE "division" ALTER COLUMN "position" SET NOT NULL;
