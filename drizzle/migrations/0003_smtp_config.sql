-- Migration: Add SMTP configuration to email_subscriptions
-- Created at: 2026-04-14

ALTER TABLE "email_subscriptions" ADD COLUMN IF NOT EXISTS "smtp_host" varchar(255);
ALTER TABLE "email_subscriptions" ADD COLUMN IF NOT EXISTS "smtp_port" integer DEFAULT 587;
ALTER TABLE "email_subscriptions" ADD COLUMN IF NOT EXISTS "smtp_user" varchar(255);
ALTER TABLE "email_subscriptions" ADD COLUMN IF NOT EXISTS "smtp_pass" text;
ALTER TABLE "email_subscriptions" ADD COLUMN IF NOT EXISTS "smtp_from" varchar(255);
