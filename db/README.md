# Database

Schema: `db/schema.ts` (Drizzle). Migrations: `db/migrations/`.
Row Level Security: `db/policies.sql`, applied separately — see below.

## Already have a project? Run `db/APPLY.sql`

**Nothing applies migrations automatically.** If the app reports a missing
column — or a `[ FAULT ]` panel — the pending schema has not been run.
`db/APPLY.sql` contains everything after `0000` (migrations `0001`–`0003` plus
the `epics` RLS that drizzle-kit does not generate) as one idempotent paste,
ending with queries that print what landed. Running it twice is safe.

Verified against a real PostgreSQL 16 before shipping: clean apply, idempotent
re-apply, correct ordering with `policies.sql`, `epics` isolation between two
simulated users, and a proof that `event_log` stays append-only (the row's own
owner is denied both `UPDATE` and `DELETE`).

## Applying to a fresh Supabase project

1. Create the project at supabase.com (Task #7 in this repo's history —
   needs a human, can't be scripted from here).
2. In the Supabase SQL Editor, run `db/migrations/0000_mysterious_ink.sql`,
   then `db/APPLY.sql`, then `db/policies.sql`, in that order. (`policies.sql`
   must come last: it adds a foreign key on `quests.epic_id` and policies on
   `epics`, both of which need the columns/table that `APPLY.sql` creates.)
3. Copy the project URL and anon key into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
   Same two values go into Vercel's project environment variables.

No service role key is needed for anything in Phase 1 — every table has RLS
policies scoped to `auth.uid()`, so the anon key plus a signed-in user's JWT
is sufficient.

## Why two files instead of one Drizzle push

`drizzle-kit generate`/`push` model tables, not Postgres `ALTER TABLE ...
ENABLE ROW LEVEL SECURITY` or `CREATE POLICY`, which are Supabase/Postgres-
specific and reference `auth.users` — a schema Drizzle doesn't know about.
Keeping RLS as reviewable raw SQL is also more honest: it's the one file in
this repo where a mistake means one user's data leaking to another, so it
should be readable end-to-end rather than generated.

## Verifying policies before trusting them

Both files were applied to a real local Postgres 16 instance (not just
read), against a stub `auth.users` / `auth.uid()` matching Supabase's real
interface, with two simulated users. Confirmed behaviourally, not just by
inspection:

- A user can insert and read only their own rows in all three tables.
- A user cannot insert a row claiming another user's `user_id`.
- `event_log` cannot be UPDATEd or DELETEd by anyone, including the row's
  own owner — there is no policy for either action, and RLS denies by
  default. This is what makes the honesty system's audit trail provable
  rather than decorative.
- A `quests` row can be deleted only while `status = 'active'` — a
  completed quest is part of the player's real history and isn't erasable
  through the API.

Re-run this yourself before applying to production if anything in
`db/policies.sql` changes: create a scratch Postgres database, apply the
stub + migration + policies, then insert/select/update/delete as two
different simulated users and confirm the boundaries above still hold.
