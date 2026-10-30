-- Catch-up for schema changes that were applied with `prisma db push` and never
-- recorded as migrations (reports, system_settings, sensor_id, last_active).
-- Existing databases already have them: mark as applied with
--   npx prisma migrate resolve --applied 20261029160000_sync_schema

-- AlterTable
ALTER TABLE "attack_logs" ADD COLUMN     "sensor_id" VARCHAR(100);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_active" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "reports" (
    "report_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "period" VARCHAR(50) NOT NULL,
    "total_attacks" INTEGER NOT NULL,
    "size_kb" DOUBLE PRECISION NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "time_zone" VARCHAR(50),
    "generated_by" VARCHAR(255),
    "pdf_bytes" INTEGER,
    "csv_bytes" INTEGER,
    "json_bytes" INTEGER,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("report_id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "setting_id" SERIAL NOT NULL,
    "session_timeout_minutes" INTEGER NOT NULL DEFAULT 30,
    "timezone" TEXT NOT NULL DEFAULT 'WIB',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("setting_id")
);

