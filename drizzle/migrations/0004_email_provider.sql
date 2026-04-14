-- Migration: Add email_provider and email_api_key columns
ALTER TABLE "email_subscriptions" ADD COLUMN IF NOT EXISTS "email_provider" varchar(20);
ALTER TABLE "email_subscriptions" ADD COLUMN IF NOT EXISTS "email_api_key" text;
