ALTER TABLE "feeds" ADD COLUMN "error_code" varchar(30);--> statement-breakpoint
ALTER TABLE "feeds" ADD COLUMN "consecutive_failures" integer DEFAULT 0 NOT NULL;