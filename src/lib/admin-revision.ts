import "server-only";
import {unstable_cache} from "next/cache";
import {db} from "./db";
import {PUBLIC_TAG} from "./public-data";
import {ADMIN_LEDGER_TAG} from "./cache-tags";
import {TRANSACTION_SUMMARY_TAG} from "./transaction-summary";
import {localDate} from "./domain";
// One cached version check replaces repeated reloads of all admin read models.
const revision=unstable_cache(async()=>{
 const [row]=await db.$queryRaw<{ledger:string;source:string;sync:string}[]>`
 SELECT
 md5(concat_ws('|',
  (SELECT max("updatedAt")::text FROM "BankTransaction"),
  (SELECT max("updatedAt")::text FROM "Fund"),
  (SELECT max("createdAt")::text FROM "AuditLog")
 )) AS ledger,
 md5(concat_ws('|',(SELECT max("sourceAttemptAt")::text FROM "BankAccount"))) AS source,
 md5(concat_ws('|',(SELECT max("receivedAt")::text FROM "SyncInvocation"),(SELECT max("lastSuccessAt")::text FROM "SyncState"))) AS sync`;
 return row;
},["admin-revision-v1"],{revalidate:30,tags:[PUBLIC_TAG,ADMIN_LEDGER_TAG,TRANSACTION_SUMMARY_TAG]});
export async function loadAdminRevision(){return {...await revision(),day:localDate()}}
