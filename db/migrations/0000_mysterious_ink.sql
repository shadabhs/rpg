CREATE TABLE "event_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"domain" text,
	"difficulty" text,
	"evidence" text,
	"retracts_event_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"character_name" text DEFAULT 'SUBJECT' NOT NULL,
	"title" text DEFAULT 'The Unproven' NOT NULL,
	"avatar_character" text DEFAULT 'default' NOT NULL,
	"induction_completed_at" timestamp with time zone,
	"season_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"domain" text NOT NULL,
	"difficulty" text NOT NULL,
	"when_text" text NOT NULL,
	"where_text" text NOT NULL,
	"weighty" boolean DEFAULT false NOT NULL,
	"grants" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "event_log_user_id_idx" ON "event_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "event_log_occurred_at_idx" ON "event_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "quests_user_id_idx" ON "quests" USING btree ("user_id");