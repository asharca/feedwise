CREATE TABLE "email_digest_log_articles" (
	"log_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	CONSTRAINT "email_digest_log_articles_log_id_article_id_pk" PRIMARY KEY("log_id","article_id")
);
--> statement-breakpoint
ALTER TABLE "email_digest_log_articles" ADD CONSTRAINT "email_digest_log_articles_log_id_email_digest_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."email_digest_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_digest_log_articles" ADD CONSTRAINT "email_digest_log_articles_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;