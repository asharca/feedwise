ALTER TABLE "email_subscriptions" ADD COLUMN "llm_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "email_subscriptions" ADD COLUMN "llm_base_url" varchar(500);--> statement-breakpoint
ALTER TABLE "email_subscriptions" ADD COLUMN "llm_api_key" text;--> statement-breakpoint
ALTER TABLE "email_subscriptions" ADD COLUMN "llm_model" varchar(100);