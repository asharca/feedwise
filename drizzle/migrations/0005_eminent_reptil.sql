-- Add cron expression support and article-level tracking

ALTER TABLE "email_subscriptions" ADD COLUMN IF NOT EXISTS "cron_expression" varchar(100);
ALTER TABLE "email_subscriptions" ADD COLUMN IF NOT EXISTS "next_scheduled_at" timestamp;

CREATE TABLE IF NOT EXISTS "email_digest_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "sent_at" timestamp NOT NULL DEFAULT now(),
  "article_count" integer DEFAULT 0,
  "status" varchar(20) DEFAULT 'success',
  "error_message" text
);

CREATE TABLE IF NOT EXISTS "email_sent_articles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "article_id" uuid NOT NULL REFERENCES "articles"("id") ON DELETE CASCADE,
  "sent_at" timestamp NOT NULL DEFAULT now(),
  UNIQUE ("user_id", "article_id")
);
