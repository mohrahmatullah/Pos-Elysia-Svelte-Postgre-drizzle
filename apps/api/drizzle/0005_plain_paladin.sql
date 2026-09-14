CREATE TYPE "public"."discount_type" AS ENUM('PERCENT', 'NOMINAL');--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "discount_type" "discount_type" DEFAULT 'NOMINAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "discount_value" numeric(18, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "default_discount_type" "discount_type" DEFAULT 'NOMINAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "default_discount_value" numeric(18, 2) DEFAULT '0' NOT NULL;