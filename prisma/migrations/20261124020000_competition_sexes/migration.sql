-- AlterTable
ALTER TABLE "competition" ADD COLUMN     "sexes" "Sex"[] DEFAULT ARRAY['FEMALE', 'MALE']::"Sex"[];
