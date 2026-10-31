import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const globalDb = globalThis as unknown as { prisma?: PrismaClient; prismaSchemaVersion?: string };
// Replace the development singleton after Prisma schema additions during hot reload.
const schemaVersion = "20261101010000";
export const db = (globalDb.prismaSchemaVersion === schemaVersion && globalDb.prisma?.constructor === PrismaClient ? globalDb.prisma : undefined) ?? new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 10000 }),
});
if (process.env.NODE_ENV !== "production") {
  globalDb.prisma = db;
  globalDb.prismaSchemaVersion = schemaVersion;
}
