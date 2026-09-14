CREATE TYPE "public"."business_type" AS ENUM('RETAIL', 'RESTO', 'HYBRID');--> statement-breakpoint
CREATE TYPE "public"."resto_order_status" AS ENUM('OPEN', 'SETTLED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."table_status" AS ENUM('FREE', 'OCCUPIED', 'RESERVED');--> statement-breakpoint
ALTER TABLE "menus" ADD COLUMN "business_scope" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "available_retail" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "available_resto" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "business_type" "business_type" DEFAULT 'RETAIL' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menus_scope_idx" ON "menus" USING btree ("business_scope");