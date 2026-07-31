-- Row Level Security for THE SYSTEM.
--
-- Apply after db/migrations/0000_*.sql. Run once per Supabase project via
-- the SQL editor (or `psql "$DATABASE_URL" -f db/policies.sql`).
--
-- The load-bearing property: event_log gets INSERT and SELECT policies and
-- NOTHING ELSE. There is no UPDATE or DELETE policy for any role, which
-- means even the row's own owner cannot rewrite or erase history through
-- the API — RLS denies by default when no policy grants an action. That is
-- what makes the honesty system's audit trail provable rather than
-- decorative (see "event-source the progression" in DESIGN.md).

alter table "profiles"
  add constraint "profiles_user_id_fkey"
  foreign key ("user_id") references auth.users(id) on delete cascade;

alter table "quests"
  add constraint "quests_user_id_fkey"
  foreign key ("user_id") references auth.users(id) on delete cascade;

alter table "event_log"
  add constraint "event_log_user_id_fkey"
  foreign key ("user_id") references auth.users(id) on delete cascade;

alter table "profiles" enable row level security;
alter table "quests" enable row level security;
alter table "event_log" enable row level security;

-- profiles: the player can read and maintain their own cosmetic record.
create policy "profiles_select_own"
  on "profiles" for select
  using (user_id = auth.uid());

create policy "profiles_insert_own"
  on "profiles" for insert
  with check (user_id = auth.uid());

create policy "profiles_update_own"
  on "profiles" for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- quests: the player can manage their own quest definitions. Deletion is
-- allowed only while a quest is still active — a completed quest is part
-- of the player's real history and isn't erasable through the API, same
-- spirit as the event log.
create policy "quests_select_own"
  on "quests" for select
  using (user_id = auth.uid());

create policy "quests_insert_own"
  on "quests" for insert
  with check (user_id = auth.uid());

create policy "quests_update_own"
  on "quests" for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "quests_delete_own_active_only"
  on "quests" for delete
  using (user_id = auth.uid() and status = 'active');

-- event_log: append-only. INSERT and SELECT only — no update policy, no
-- delete policy, for any role, including the row's own owner.
create policy "event_log_select_own"
  on "event_log" for select
  using (user_id = auth.uid());

create policy "event_log_insert_own"
  on "event_log" for insert
  with check (user_id = auth.uid());

-- Explicit table grants for the `authenticated` role. Supabase's own
-- migration flow does this automatically; since these tables were created
-- via an external migration tool, the grants are stated here so nothing
-- depends on dashboard defaults. RLS still governs row-level access even
-- though these grants are broad at the table level.
grant select, insert, update on "profiles" to authenticated;
grant select, insert, update, delete on "quests" to authenticated;
grant select, insert on "event_log" to authenticated;
