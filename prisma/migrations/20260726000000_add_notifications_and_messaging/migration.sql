-- In-app notifications + two-way staff<->creator messaging.
--
-- notifications:   per-user inbox rows for system events (application decisions,
--                  sample/preset moderation, broadcast fan-out copies).
-- broadcasts:      one canonical row per admin announcement; recipients get thin
--                  per-user notification rows (readAt doubles as a read receipt).
-- message_threads: one conversation between a user and "Greenroom Team" (staff,
--                  collectively). userUnread/staffUnread are idempotent booleans,
--                  not counters. staffUnread is shared team-inbox state.
-- messages:        immutable plain-text messages; sender_role is denormalized so
--                  history renders correctly after role changes / account deletion.

CREATE TYPE "NotificationType" AS ENUM (
  'APPLICATION_APPROVED',
  'APPLICATION_DENIED',
  'SAMPLE_APPROVED',
  'SAMPLE_REJECTED',
  'SAMPLE_REMOVED',
  'PRESET_APPROVED',
  'PRESET_REJECTED',
  'PRESET_REMOVED',
  'BROADCAST'
);

CREATE TYPE "ThreadStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TYPE "MessageSenderRole" AS ENUM ('USER', 'STAFF');

CREATE TABLE "broadcasts" (
    "id" UUID NOT NULL,
    "author_id" UUID,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "message_threads" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_by_id" UUID,
    "subject" TEXT NOT NULL,
    "context_type" TEXT,
    "context_id" UUID,
    "status" "ThreadStatus" NOT NULL DEFAULT 'OPEN',
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_unread" BOOLEAN NOT NULL DEFAULT false,
    "staff_unread" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "sender_id" UUID,
    "sender_role" "MessageSenderRole" NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "context_type" TEXT,
    "context_id" UUID,
    "metadata" JSONB,
    "broadcast_id" UUID,
    "thread_id" UUID,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "broadcasts_created_at_idx" ON "broadcasts"("created_at" DESC);

CREATE INDEX "message_threads_user_id_last_message_at_idx" ON "message_threads"("user_id", "last_message_at" DESC);

CREATE INDEX "message_threads_status_last_message_at_idx" ON "message_threads"("status", "last_message_at" DESC);

CREATE INDEX "message_threads_staff_unread_last_message_at_idx" ON "message_threads"("staff_unread", "last_message_at" DESC);

CREATE INDEX "messages_thread_id_created_at_idx" ON "messages"("thread_id", "created_at");

CREATE INDEX "messages_sender_id_idx" ON "messages"("sender_id");

CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

CREATE INDEX "notifications_broadcast_id_idx" ON "notifications"("broadcast_id");

CREATE INDEX "notifications_thread_id_idx" ON "notifications"("thread_id");

ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_fkey"
    FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey"
    FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_broadcast_id_fkey"
    FOREIGN KEY ("broadcast_id") REFERENCES "broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_thread_id_fkey"
    FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
