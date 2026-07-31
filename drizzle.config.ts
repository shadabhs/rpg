import { defineConfig } from "drizzle-kit";

/**
 * `drizzle-kit generate` only needs the schema, not a live connection —
 * migrations are committed and applied against Supabase separately (see
 * db/README.md). `dbCredentials.url` is required by the config type but
 * unused by `generate`; DATABASE_URL only needs to be real for `push` or
 * `migrate`, neither of which this repo runs yet.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://placeholder/placeholder",
  },
});
