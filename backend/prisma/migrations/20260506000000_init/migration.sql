-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "users_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("users_id")
);

-- CreateTable
CREATE TABLE "attackers" (
    "attacker_id" UUID NOT NULL,
    "source_ip" INET NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attackers_pkey" PRIMARY KEY ("attacker_id")
);

-- CreateTable
CREATE TABLE "attack_logs" (
    "log_id" UUID NOT NULL,
    "access_time" TIMESTAMP(3) NOT NULL,
    "attacker_id" UUID NOT NULL,
    "username_attempt" VARCHAR(255),
    "password_attempt" VARCHAR(255),
    "attempt_number" INTEGER NOT NULL,
    "status" VARCHAR(50),
    "reviewed_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attack_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "attack_logs" ADD CONSTRAINT "attack_logs_attacker_id_fkey" FOREIGN KEY ("attacker_id") REFERENCES "attackers"("attacker_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attack_logs" ADD CONSTRAINT "attack_logs_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("users_id") ON DELETE SET NULL ON UPDATE CASCADE;
