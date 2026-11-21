import {countDatabaseQuery} from "./operation-metrics";
import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { databaseConnectionString } from "./database-url";
import {cloudflareContext} from "./cloudflare-context";
const globalDb = globalThis as unknown as { prisma?: ReturnType<typeof createClient>; prismaSchemaVersion?: string };
const schemaVersion = "20261121-workers-request-scope-v1";
function createClient(worker=false){return new PrismaClient({
 adapter:new PrismaPg({connectionString:databaseConnectionString(process.env.DATABASE_URL),max:3,connectionTimeoutMillis:10000,
  // A socket cannot outlive the Workers request that opened it.
  ...(worker?{maxUses:1,allowExitOnIdle:true}:{}),
 }),
}).$extends({query:{$allOperations:async({args,query})=>{countDatabaseQuery();return query(args);}}}) as unknown as PrismaClient;}
const requestClients=new WeakMap<object,PrismaClient>();
let nodeClient:PrismaClient|undefined;
function client(){
 const context=cloudflareContext();
 if(context){
  let scoped=requestClients.get(context.ctx);
  if(!scoped){scoped=createClient(true);requestClients.set(context.ctx,scoped);}
  return scoped;
 }
 nodeClient??=(globalDb.prismaSchemaVersion===schemaVersion?globalDb.prisma:undefined)??createClient();
 if(process.env.NODE_ENV!=="production"){
  globalDb.prisma=nodeClient;globalDb.prismaSchemaVersion=schemaVersion;
 }
 return nodeClient;
}
// Preserve the existing db API while choosing the client only inside a request.
export const db=new Proxy({} as PrismaClient,{
 get(_target,key){const current=client(),value=Reflect.get(current,key);return typeof value==="function"?value.bind(current):value;},
});
