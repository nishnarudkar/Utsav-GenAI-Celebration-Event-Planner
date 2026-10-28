import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";

export type Db = PostgresJsDatabase<typeof schema>;

let db: Db | undefined;

/**
 * Lazily connected so importing never throws without DATABASE_URL (tests, demo mode).
 * `prepare: false` is required by Supabase's transaction-mode pooler (port 6543).
 */
export function getDb(): Db {
  if (db) return db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — copy .env.example to .env.local and fill it in.");
  const client = postgres(url, { prepare: false, max: 5 });
  db = drizzle(client, { schema });
  return db;
}
