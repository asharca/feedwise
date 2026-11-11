CREATE TABLE "hot_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_key" varchar(80) NOT NULL,
	"item_key" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"cover" text,
	"desc" text,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"peak_rank" integer NOT NULL,
	CONSTRAINT "hot_items_source_key_item_key_unique" UNIQUE("source_key","item_key")
);
--> statement-breakpoint
CREATE TABLE "hot_ranks" (
	"snapshot_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"heat" double precision,
	CONSTRAINT "hot_ranks_snapshot_id_item_id_pk" PRIMARY KEY("snapshot_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "hot_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_key" varchar(80) NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hot_sources" (
	"key" varchar(80) PRIMARY KEY NOT NULL,
	"last_fetched_at" timestamp,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hot_items" ADD CONSTRAINT "hot_items_source_key_hot_sources_key_fk" FOREIGN KEY ("source_key") REFERENCES "public"."hot_sources"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hot_ranks" ADD CONSTRAINT "hot_ranks_snapshot_id_hot_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."hot_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hot_ranks" ADD CONSTRAINT "hot_ranks_item_id_hot_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."hot_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hot_snapshots" ADD CONSTRAINT "hot_snapshots_source_key_hot_sources_key_fk" FOREIGN KEY ("source_key") REFERENCES "public"."hot_sources"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hot_items_source_seen_idx" ON "hot_items" USING btree ("source_key","last_seen_at");--> statement-breakpoint
CREATE INDEX "hot_snapshots_source_captured_idx" ON "hot_snapshots" USING btree ("source_key","captured_at");