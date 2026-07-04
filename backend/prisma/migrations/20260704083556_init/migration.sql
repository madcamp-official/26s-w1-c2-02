-- CreateEnum
CREATE TYPE "AcquiredType" AS ENUM ('CREATED', 'MATCHED');

-- CreateEnum
CREATE TYPE "OwnedWakppuballStatus" AS ENUM ('ACTIVE', 'CONSUMED');

-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "username" VARCHAR(20) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wakppuball_models" (
    "id" BIGSERIAL NOT NULL,
    "creator_user_id" BIGINT,
    "name" VARCHAR(50),
    "model_url" TEXT,
    "thumbnail_url" TEXT,
    "customization_json" JSONB,
    "fracture_json" JSONB,
    "default_break_count" INTEGER NOT NULL DEFAULT 3,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wakppuball_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_wakppuballs" (
    "id" BIGSERIAL NOT NULL,
    "owner_user_id" BIGINT NOT NULL,
    "wakppuball_model_id" BIGINT NOT NULL,
    "acquired_type" "AcquiredType" NOT NULL DEFAULT 'CREATED',
    "acquired_from_user_id" BIGINT,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "remaining_break_count" INTEGER NOT NULL DEFAULT 3,
    "status" "OwnedWakppuballStatus" NOT NULL DEFAULT 'ACTIVE',
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumed_at" TIMESTAMP(3),

    CONSTRAINT "user_wakppuballs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_history" (
    "id" BIGSERIAL NOT NULL,
    "user_a_id" BIGINT NOT NULL,
    "user_b_id" BIGINT NOT NULL,
    "user_a_sent_wakppuball_id" BIGINT,
    "user_b_sent_wakppuball_id" BIGINT,
    "matched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "user_wakppuballs_owner_user_id_status_idx" ON "user_wakppuballs"("owner_user_id", "status");

-- CreateIndex
CREATE INDEX "user_wakppuballs_owner_user_id_is_main_idx" ON "user_wakppuballs"("owner_user_id", "is_main");

-- AddForeignKey
ALTER TABLE "wakppuball_models" ADD CONSTRAINT "wakppuball_models_creator_user_id_fkey" FOREIGN KEY ("creator_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_wakppuballs" ADD CONSTRAINT "user_wakppuballs_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_wakppuballs" ADD CONSTRAINT "user_wakppuballs_wakppuball_model_id_fkey" FOREIGN KEY ("wakppuball_model_id") REFERENCES "wakppuball_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_wakppuballs" ADD CONSTRAINT "user_wakppuballs_acquired_from_user_id_fkey" FOREIGN KEY ("acquired_from_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_history" ADD CONSTRAINT "match_history_user_a_id_fkey" FOREIGN KEY ("user_a_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_history" ADD CONSTRAINT "match_history_user_b_id_fkey" FOREIGN KEY ("user_b_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_history" ADD CONSTRAINT "match_history_user_a_sent_wakppuball_id_fkey" FOREIGN KEY ("user_a_sent_wakppuball_id") REFERENCES "user_wakppuballs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_history" ADD CONSTRAINT "match_history_user_b_sent_wakppuball_id_fkey" FOREIGN KEY ("user_b_sent_wakppuball_id") REFERENCES "user_wakppuballs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
