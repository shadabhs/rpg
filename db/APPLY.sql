-- ============================================================
-- THE SYSTEM — pending schema, ready to paste into the Supabase SQL editor.
--
-- Covers migrations 0001, 0002 and 0003 plus the RLS that drizzle-kit does
-- NOT generate. Every statement is additive and idempotent, so running this
-- twice is safe and running it after a partial apply is safe.
--
-- Apply this BEFORE using a deploy built from these commits. The app reads
-- and writes these columns; without them a completion fails and the Status
-- Window shows a [ FAULT ] panel naming the missing column.
-- ============================================================

-- ---------- 0001: quest linkage, loot, cadence ----------
alter table "event_log" add column if not exists "quest_id" uuid;
alter table "event_log" add column if not exists "gold" integer;
alter table "event_log" add column if not exists "item" text;
alter table "quests"    add column if not exists "cadence" text not null default 'once';

-- ---------- 0002: epics ----------
create table if not exists "epics" (
  "id"           uuid primary key default gen_random_uuid() not null,
  "user_id"      uuid not null,
  "title"        text not null,
  "intent"       text,
  "domain"       text not null,
  "status"       text not null default 'active',
  "created_at"   timestamp with time zone default now() not null,
  "completed_at" timestamp with time zone
);
alter table "quests" add column if not exists "epic_id" uuid;
create index if not exists "epics_user_id_idx" on "epics" using btree ("user_id");

-- ---------- 0003: requisites ----------
alter table "quests"    add column if not exists "requisites" jsonb;
alter table "event_log" add column if not exists "unprepared" boolean;

-- ---------- foreign keys ----------
do $$ begin
  alter table "epics" add constraint "epics_user_id_fkey"
    foreign key ("user_id") references auth.users(id) on delete cascade;
exception when duplicate_object then null; end $$;

-- A deleted epic must not orphan its quests; they return to standalone.
do $$ begin
  alter table "quests" add constraint "quests_epic_id_fkey"
    foreign key ("epic_id") references "epics"(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------- RLS for epics ----------
-- drizzle-kit does NOT generate row level security. A new table is
-- unprotected until this runs, so it is stated explicitly here.
alter table "epics" enable row level security;

do $$ begin
  create policy "epics_select_own" on "epics" for select
    using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "epics_insert_own" on "epics" for insert
    with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "epics_update_own" on "epics" for update
    using (user_id = auth.uid()) with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

grant select, insert, update on "epics" to authenticated;

-- ---------- verify ----------
-- Expect: cadence, epic_id, requisites on quests; quest_id, gold, item,
-- unprepared on event_log; and three policies on epics.
select table_name, column_name
  from information_schema.columns
 where table_schema = 'public'
   and (
     (table_name = 'quests'    and column_name in ('cadence','epic_id','requisites')) or
     (table_name = 'event_log' and column_name in ('quest_id','gold','item','unprepared'))
   )
 order by table_name, column_name;

select tablename, policyname from pg_policies
 where schemaname = 'public' and tablename = 'epics'
 order by policyname;
