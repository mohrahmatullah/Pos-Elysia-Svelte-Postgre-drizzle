CREATE TABLE IF NOT EXISTS "dining_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "resto_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"product_name" text NOT NULL,
	"sku" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(18, 2) NOT NULL,
	"discount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"kitchen_status" text DEFAULT 'QUEUED' NOT NULL,
	"sent_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resto_order_items_qty_positive_chk" CHECK ("resto_order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "resto_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"sale_id" uuid,
	"customer_id" uuid,
	"status" "resto_order_status" DEFAULT 'OPEN' NOT NULL,
	"guests" integer DEFAULT 1 NOT NULL,
	"opened_by" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "resto_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"area_id" uuid,
	"code" text NOT NULL,
	"seats" integer DEFAULT 4 NOT NULL,
	"status" "table_status" DEFAULT 'FREE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_areas" ADD CONSTRAINT "dining_areas_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resto_order_items" ADD CONSTRAINT "resto_order_items_order_id_resto_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."resto_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resto_order_items" ADD CONSTRAINT "resto_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resto_orders" ADD CONSTRAINT "resto_orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resto_orders" ADD CONSTRAINT "resto_orders_table_id_resto_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."resto_tables"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resto_orders" ADD CONSTRAINT "resto_orders_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resto_orders" ADD CONSTRAINT "resto_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resto_orders" ADD CONSTRAINT "resto_orders_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resto_tables" ADD CONSTRAINT "resto_tables_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resto_tables" ADD CONSTRAINT "resto_tables_area_id_dining_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."dining_areas"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dining_areas_store_idx" ON "dining_areas" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dining_areas_store_name_uq" ON "dining_areas" USING btree ("store_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resto_order_items_order_idx" ON "resto_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resto_order_items_product_idx" ON "resto_order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resto_order_items_kitchen_idx" ON "resto_order_items" USING btree ("kitchen_status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "resto_orders_open_per_table_uq" ON "resto_orders" USING btree ("table_id") WHERE status = 'OPEN';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resto_orders_store_status_idx" ON "resto_orders" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resto_orders_table_idx" ON "resto_orders" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resto_orders_sale_idx" ON "resto_orders" USING btree ("sale_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "resto_tables_store_code_uq" ON "resto_tables" USING btree ("store_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resto_tables_store_idx" ON "resto_tables" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resto_tables_area_idx" ON "resto_tables" USING btree ("area_id");