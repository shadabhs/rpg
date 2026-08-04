ALTER TABLE "event_log" ADD COLUMN "quest_id" uuid;--> statement-breakpoint
ALTER TABLE "event_log" ADD COLUMN "gold" integer;--> statement-breakpoint
ALTER TABLE "event_log" ADD COLUMN "item" text;--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "cadence" text DEFAULT 'once' NOT NULL;