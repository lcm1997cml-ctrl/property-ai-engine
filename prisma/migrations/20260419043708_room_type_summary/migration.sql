-- AlterTable
ALTER TABLE "listing_units" ADD COLUMN     "availability" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN     "price_max" INTEGER,
ADD COLUMN     "saleable_area_max" INTEGER,
ADD COLUMN     "unit_count" INTEGER,
ALTER COLUMN "saleable_area" DROP NOT NULL,
ALTER COLUMN "price" DROP NOT NULL,
ALTER COLUMN "price_per_sqft" DROP NOT NULL;

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "address" TEXT,
ADD COLUMN     "completion_year" INTEGER,
ADD COLUMN     "total_unit_count" INTEGER;
