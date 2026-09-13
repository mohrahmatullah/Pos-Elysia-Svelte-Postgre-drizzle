ALTER TABLE "menus" ALTER COLUMN "href" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "menus" ALTER COLUMN "permission_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "menus" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menus" ADD CONSTRAINT "menus_parent_id_menus_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menus_parent_idx" ON "menus" USING btree ("parent_id");