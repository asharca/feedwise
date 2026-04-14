-- Migration: Add email subscription tables
-- Created at: 2026-04-13

CREATE TABLE IF NOT EXISTS "email_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "enabled" boolean NOT NULL DEFAULT false,
  "send_time" varchar(5) DEFAULT '08:00',
  "frequency" varchar(10) DEFAULT 'daily',
  "last_sent_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "email_subscription_tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "subscription_id" uuid NOT NULL REFERENCES "email_subscriptions"("id") ON DELETE CASCADE,
  "tag_id" uuid NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now(),
  UNIQUE ("subscription_id", "tag_id")
);

CREATE TABLE IF NOT EXISTS "email_subscription_feeds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "subscription_id" uuid NOT NULL REFERENCES "email_subscriptions"("id") ON DELETE CASCADE,
  "feed_id" uuid NOT NULL REFERENCES "feeds"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now(),
  UNIQUE ("subscription_id", "feed_id")
);
