ALTER TABLE "documents" ADD COLUMN "primary_entity" varchar(200);--> statement-breakpoint
ALTER TABLE "extracted_facts" ADD COLUMN "entity" varchar(200);