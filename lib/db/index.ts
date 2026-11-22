import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NeonHttpDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  foundDb?: Database;
  foundPool?: Pool;
};

function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

function isNeonHost(url: string) {
  return new URL(url).hostname.endsWith("neon.tech");
}

function createDb(): Database {
  const url = databaseUrl();
  if (isNeonHost(url)) {
    return drizzleNeon(neon(url), { schema });
  }

  const pool = globalForDb.foundPool ?? new Pool({ connectionString: url });
  globalForDb.foundPool = pool;
  return drizzlePg(pool, { schema }) as unknown as Database;
}

export function getDb() {
  globalForDb.foundDb ??= createDb();
  return globalForDb.foundDb;
}

export async function withTransaction<T>(run: (db: Database) => Promise<T>): Promise<T> {
  const db = getDb() as unknown as {
    transaction: (callback: (tx: Database) => Promise<T>) => Promise<T>;
  };
  return db.transaction(run);
}

export async function closeDb() {
  await globalForDb.foundPool?.end();
  globalForDb.foundPool = undefined;
  globalForDb.foundDb = undefined;
}
