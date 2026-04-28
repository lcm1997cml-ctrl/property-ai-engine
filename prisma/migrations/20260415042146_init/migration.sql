-- CreateTable
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "estate_name" TEXT NOT NULL,
    "building_name" TEXT,
    "district" TEXT NOT NULL,
    "sub_district" TEXT,
    "price" INTEGER NOT NULL,
    "price_max" INTEGER,
    "saleable_area" INTEGER NOT NULL,
    "saleable_area_max" INTEGER,
    "gross_area" INTEGER,
    "psf" INTEGER NOT NULL,
    "bedrooms" INTEGER NOT NULL,
    "bathrooms" INTEGER,
    "property_type" TEXT NOT NULL DEFAULT '住宅',
    "floor" TEXT,
    "facing" TEXT,
    "age" INTEGER,
    "developer" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "description" TEXT,
    "source" TEXT NOT NULL DEFAULT '28hse',
    "source_url" TEXT,
    "source_type" TEXT NOT NULL DEFAULT 'new',
    "comparison_role" TEXT NOT NULL DEFAULT 'primary',
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "image_url" TEXT,
    "tags" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_units" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "unit_label" TEXT,
    "room_count" INTEGER NOT NULL,
    "saleable_area" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "price_per_sqft" INTEGER NOT NULL,
    "source_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_media" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "media_type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "source_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_sources" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "crawled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_payload_json" TEXT,
    "normalized_hash" TEXT,

    CONSTRAINT "listing_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_snapshots" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "snapshot_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload_json" TEXT NOT NULL,

    CONSTRAINT "listing_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawl_jobs" (
    "id" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "records_found" INTEGER NOT NULL DEFAULT 0,
    "records_inserted" INTEGER NOT NULL DEFAULT 0,
    "records_updated" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crawl_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "listings_slug_key" ON "listings"("slug");

-- CreateIndex
CREATE INDEX "listings_district_idx" ON "listings"("district");

-- CreateIndex
CREATE INDEX "listings_source_type_idx" ON "listings"("source_type");

-- CreateIndex
CREATE INDEX "listings_price_idx" ON "listings"("price");

-- CreateIndex
CREATE INDEX "listings_slug_idx" ON "listings"("slug");

-- CreateIndex
CREATE INDEX "listing_units_listing_id_idx" ON "listing_units"("listing_id");

-- CreateIndex
CREATE INDEX "listing_media_listing_id_idx" ON "listing_media"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "listing_media_listing_id_url_key" ON "listing_media"("listing_id", "url");

-- CreateIndex
CREATE INDEX "listing_sources_listing_id_idx" ON "listing_sources"("listing_id");

-- CreateIndex
CREATE INDEX "listing_sources_source_url_idx" ON "listing_sources"("source_url");

-- CreateIndex
CREATE INDEX "listing_sources_normalized_hash_idx" ON "listing_sources"("normalized_hash");

-- CreateIndex
CREATE INDEX "listing_snapshots_listing_id_idx" ON "listing_snapshots"("listing_id");

-- CreateIndex
CREATE INDEX "listing_snapshots_snapshot_at_idx" ON "listing_snapshots"("snapshot_at");

-- CreateIndex
CREATE INDEX "crawl_jobs_job_name_idx" ON "crawl_jobs"("job_name");

-- CreateIndex
CREATE INDEX "crawl_jobs_status_idx" ON "crawl_jobs"("status");

-- AddForeignKey
ALTER TABLE "listing_units" ADD CONSTRAINT "listing_units_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_media" ADD CONSTRAINT "listing_media_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_sources" ADD CONSTRAINT "listing_sources_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_snapshots" ADD CONSTRAINT "listing_snapshots_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
