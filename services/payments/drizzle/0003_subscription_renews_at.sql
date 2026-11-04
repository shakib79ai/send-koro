ALTER TABLE "subscriptions" ADD COLUMN "renews_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "subscriptions_renews_at" ON "subscriptions" USING btree ("renews_at");