-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "data_completeness" TEXT NOT NULL DEFAULT 'full',
ALTER COLUMN "price" DROP NOT NULL,
ALTER COLUMN "psf" DROP NOT NULL;
