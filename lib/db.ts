import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const globalDb = globalThis as typeof globalThis & { schedulerDb?: PrismaClient };

export function db() {
  if (globalDb.schedulerDb) return globalDb.schedulerDb;
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  globalDb.schedulerDb = new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: 3, connectionTimeoutMillis: 5000 }),
  });
  return globalDb.schedulerDb;
}
