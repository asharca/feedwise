-- CJK-aware search helpers. Postgres' default parser treats a run of CJK
-- characters as one "word", so substring search inside Chinese/Japanese/Korean
-- text never matches. We index overlapping bigrams of every CJK run instead
-- (unigram for single-character runs) and build phrase queries the same way.
CREATE OR REPLACE FUNCTION feedwise_search_text(t text) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE AS $fn$
DECLARE
  run text;
  n int;
  i int;
  out text := '';
BEGIN
  FOR run IN
    SELECT (regexp_matches(t, '[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]+|[^\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]+', 'g'))[1]
  LOOP
    IF run ~ '^[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]' THEN
      n := char_length(run);
      IF n = 1 THEN
        out := out || ' ' || run || ' ';
      ELSE
        FOR i IN 1..n - 1 LOOP
          out := out || ' ' || substr(run, i, 2);
        END LOOP;
        out := out || ' ';
      END IF;
    ELSE
      out := out || regexp_replace(run, '[[:punct:]]+', ' ', 'g');
    END IF;
  END LOOP;
  RETURN out;
END
$fn$;
--> statement-breakpoint
-- Whitespace-separated terms are AND-ed; a leading "-" negates a term. Within a
-- term, CJK bigrams and latin/digit tokens form a phrase; latin tokens and
-- single CJK characters match as prefixes. Returns NULL for an empty query.
CREATE OR REPLACE FUNCTION feedwise_search_query(q text) RETURNS tsquery
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE AS $fn$
DECLARE
  term text;
  tok text;
  neg boolean;
  n int;
  i int;
  part tsquery;
  termq tsquery;
  result tsquery;
BEGIN
  FOREACH term IN ARRAY regexp_split_to_array(btrim(lower(q)), '\s+')
  LOOP
    neg := char_length(term) > 1 AND left(term, 1) = '-';
    IF neg THEN
      term := substr(term, 2);
    END IF;
    termq := NULL;
    FOR tok IN
      SELECT (regexp_matches(term, '[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]+|[^[:space:][:punct:]\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]+', 'g'))[1]
    LOOP
      IF tok ~ '^[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]' AND char_length(tok) > 1 THEN
        n := char_length(tok);
        part := NULL;
        FOR i IN 1..n - 1 LOOP
          IF part IS NULL THEN
            part := to_tsquery('simple', quote_literal(substr(tok, i, 2)));
          ELSE
            part := tsquery_phrase(part, to_tsquery('simple', quote_literal(substr(tok, i, 2))));
          END IF;
        END LOOP;
      ELSE
        part := to_tsquery('simple', quote_literal(tok) || ':*');
      END IF;
      IF termq IS NULL THEN
        termq := part;
      ELSE
        termq := tsquery_phrase(termq, part);
      END IF;
    END LOOP;
    CONTINUE WHEN termq IS NULL;
    IF neg THEN
      termq := !! termq;
    END IF;
    IF result IS NULL THEN
      result := termq;
    ELSE
      result := result && termq;
    END IF;
  END LOOP;
  RETURN result;
END
$fn$;
--> statement-breakpoint
CREATE TABLE "api_credentials" (
	"user_id" text PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"fever_key" varchar(32) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_credentials_fever_key_unique" UNIQUE("fever_key")
);
--> statement-breakpoint
CREATE TABLE "client_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"client" varchar(100),
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "notification_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" varchar(20) NOT NULL,
	"name" varchar(100) NOT NULL,
	"config" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_error" text,
	"last_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "rule_hot_hits" (
	"rule_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rule_hot_hits_rule_id_item_id_pk" PRIMARY KEY("rule_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar(100) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"scope" varchar(10) DEFAULT 'article' NOT NULL,
	"match_mode" varchar(3) DEFAULT 'all' NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_feeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar(100) NOT NULL,
	"token" varchar(64) NOT NULL,
	"filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "share_feeds_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "seq" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "media" jsonb;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "simhash" bigint;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "full_content_html" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "full_content_status" varchar(10);--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "full_content_fetched_at" timestamp;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "sort_at" timestamp GENERATED ALWAYS AS (coalesce(published_at, created_at)) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "search_tsv" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple'::regconfig, feedwise_search_text(coalesce(title, ''))), 'A') || setweight(to_tsvector('simple'::regconfig, feedwise_search_text(coalesce(ai_summary, '') || ' ' || coalesce(summary, '') || ' ' || left(coalesce(content_text, ''), 20000))), 'B')) STORED;--> statement-breakpoint
ALTER TABLE "feeds" ADD COLUMN "seq" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "feeds" ADD COLUMN "source_type" varchar(10) DEFAULT 'rss' NOT NULL;--> statement-breakpoint
ALTER TABLE "feeds" ADD COLUMN "source_config" jsonb;--> statement-breakpoint
ALTER TABLE "feeds" ADD COLUMN "default_view" varchar(10);--> statement-breakpoint
ALTER TABLE "feeds" ADD COLUMN "next_fetch_at" timestamp;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "seq" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "view" varchar(10);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "fetch_full_text" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_articles" ADD COLUMN "is_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "api_credentials" ADD CONSTRAINT "api_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_tokens" ADD CONSTRAINT "client_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_hot_hits" ADD CONSTRAINT "rule_hot_hits_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_hot_hits" ADD CONSTRAINT "rule_hot_hits_item_id_hot_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."hot_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_feeds" ADD CONSTRAINT "share_feeds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_tokens_user_idx" ON "client_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_channels_user_idx" ON "notification_channels" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rules_user_idx" ON "rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "share_feeds_user_idx" ON "share_feeds" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "articles_feed_sort_idx" ON "articles" USING btree ("feed_id","sort_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "articles_sort_idx" ON "articles" USING btree ("sort_at");--> statement-breakpoint
CREATE INDEX "articles_search_tsv_idx" ON "articles" USING gin ("search_tsv");--> statement-breakpoint
CREATE INDEX "feeds_next_fetch_idx" ON "feeds" USING btree ("next_fetch_at");--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_seq_unique" UNIQUE("seq");--> statement-breakpoint
ALTER TABLE "feeds" ADD CONSTRAINT "feeds_seq_unique" UNIQUE("seq");--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_seq_unique" UNIQUE("seq");