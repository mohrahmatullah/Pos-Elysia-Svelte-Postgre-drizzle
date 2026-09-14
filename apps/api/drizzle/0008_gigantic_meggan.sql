ALTER TABLE "sessions" ADD COLUMN "active_store_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_store_id_stores_id_fk" FOREIGN KEY ("active_store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
