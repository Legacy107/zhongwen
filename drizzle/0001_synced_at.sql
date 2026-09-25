ALTER TABLE "cards" ADD COLUMN "synced_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "synced_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "synced_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "cards_synced_at_idx" ON "cards" USING btree ("synced_at");--> statement-breakpoint
CREATE INDEX "reviews_synced_at_idx" ON "reviews" USING btree ("synced_at");--> statement-breakpoint
CREATE INDEX "settings_synced_at_idx" ON "settings" USING btree ("synced_at");