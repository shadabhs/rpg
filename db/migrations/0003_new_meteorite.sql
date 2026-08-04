ALTER TABLE "event_log" ADD COLUMN "unprepared" boolean;--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "requisites" jsonb;