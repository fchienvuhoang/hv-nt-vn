import "server-only";
import {ADMIN_LEDGER_TAG} from "./cache-tags";
import { unstable_cache } from "next/cache";
import { db } from "./db";
import { localDate,startOfVietnamDay } from "./domain";
import { encodeAdmin,decodeAdmin } from "./admin-codec";
import { PUBLIC_TAG } from "./public-data";
export const TRANSACTION_SUMMARY_TAG="transaction-summary";
export async function transactionSummary(now=new Date()){
  const today=startOfVietnamDay(localDate(now));
  const dates=Array.from({length:10},(_,i)=>localDate(new Date(today.getTime()-i*86400000)));
  const [accounts,groups]=await Promise.all([
    db.bankAccount.findMany({select:{id:true,number:true,owner:true,sourceTotalCredit:true,sourceTotalDebit:true,sourceFetchedAt:true,sourceUpdatedAt:true,sourceAttemptAt:true,sourceError:true},orderBy:{number:"asc"}}),
    db.$queryRaw<{day:string;direction:string;count:bigint;amount:bigint}[]>`SELECT to_char("occurredAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD') AS day, direction::text AS direction, COUNT(*) AS count, SUM(amount)::bigint AS amount FROM "BankTransaction" WHERE "entryStatus" = 'POSTED' AND "occurredAt" >= ${startOfVietnamDay(dates[9])} AND "occurredAt" < ${new Date(today.getTime()+86400000)} GROUP BY day,direction`,
  ]);
  const balances=accounts.map(a=>({...a,balance:a.sourceTotalCredit!==null&&a.sourceTotalDebit!==null?a.sourceTotalCredit-a.sourceTotalDebit:null}));
  return {generatedAt:now,days:dates.map(date=>{const credit=groups.find(g=>g.day===date&&g.direction==="CREDIT"),debit=groups.find(g=>g.day===date&&g.direction==="DEBIT");return {date,incomeCount:Number(credit?.count??0n),income:credit?.amount??0n,expenseCount:Number(debit?.count??0n),expense:debit?.amount??0n}}),accounts:balances,totalBalance:balances.length>0&&balances.every(a=>a.balance!==null)?balances.reduce((sum,a)=>sum+a.balance!,0n):null};
}
export type TransactionSummary=Awaited<ReturnType<typeof transactionSummary>>;
const cached=unstable_cache(async(day:string)=>{void day;return encodeAdmin(await transactionSummary())},["transaction-summary-10-days-v2"],{revalidate:20,tags:[PUBLIC_TAG,ADMIN_LEDGER_TAG,TRANSACTION_SUMMARY_TAG]});
export async function loadTransactionSummary(){return decodeAdmin<TransactionSummary>(await cached(localDate()))}
