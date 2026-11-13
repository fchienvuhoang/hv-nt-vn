import {countDatabaseQuery} from "./operation-metrics";
import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { databaseConnectionString } from "./database-url";
const globalDb = globalThis as unknown as { prisma?: ReturnType<typeof createClient>; prismaSchemaVersion?: string };
// Replace the development singleton after Prisma schema additions during hot reload.
const schemaVersion = "20261113-transfer-keyword-v1";
function createClient(){return new PrismaClient({
 adapter:new PrismaPg({connectionString:databaseConnectionString(process.env.DATABASE_URL),max:3,connectionTimeoutMillis:10000}),
}).$extends({query:{$allOperations:async({args,query})=>{countDatabaseQuery();return query(args);}}}) as unknown as PrismaClient;}
export const db = (globalDb.prismaSchemaVersion === schemaVersion ? globalDb.prisma : undefined) ?? createClient();
if (process.env.NODE_ENV !== "production") {
  globalDb.prisma = db;
  globalDb.prismaSchemaVersion = schemaVersion;
}
