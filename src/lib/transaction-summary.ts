import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "./db";
import { localDate,startOfVietnamDay } from "./domain";
import { encodeAdmin,decodeAdmin } from "./admin-codec";
import { PUBLIC_TAG } from "./public-data";
export const TRANSACTION_SUMMARY_TAG="transaction-summary";
export async function transactionSummary(now=new Date()){
  const today=startOfVietnamDay(localDate(now));
  const dates=Array.from({length:3},(_,i)=>localDate(new Date(today.getTime()-i*86400000)));
  const [accounts,...groups]=await Promise.all([
    db.bankAccount.findMany({select:{id:true,number:true,owner:true,sourceTotalCredit:true,sourceTotalDebit:true,sourceFetchedAt:true,sourceUpdatedAt:true,sourceAttemptAt:true,sourceError:true},orderBy:{number:"asc"}}),
    ...dates.map(day=>db.bankTransaction.groupBy({by:["direction"],where:{entryStatus:"POSTED",occurredAt:{gte:startOfVietnamDay(day),lt:new Date(startOfVietnamDay(day).getTime()+86400000)}},_count:{_all:true},_sum:{amount:true}})),
  ]);
  const balances=accounts.map(a=>({...a,balance:a.sourceTotalCredit!==null&&a.sourceTotalDebit!==null?a.sourceTotalCredit-a.sourceTotalDebit:null}));
  return {generatedAt:now,days:dates.map((date,i)=>{const credit=groups[i].find(g=>g.direction==="CREDIT"),debit=groups[i].find(g=>g.direction==="DEBIT");return {date,incomeCount:credit?._count._all??0,income:credit?._sum.amount??0n,expenseCount:debit?._count._all??0,expense:debit?._sum.amount??0n}}),accounts:balances,totalBalance:balances.length>0&&balances.every(a=>a.balance!==null)?balances.reduce((sum,a)=>sum+a.balance!,0n):null};
}
export type TransactionSummary=Awaited<ReturnType<typeof transactionSummary>>;
const cached=unstable_cache(async(day:string)=>{void day;return encodeAdmin(await transactionSummary())},["transaction-summary-v1"],{revalidate:20,tags:[PUBLIC_TAG,TRANSACTION_SUMMARY_TAG]});
export async function loadTransactionSummary(){return decodeAdmin<TransactionSummary>(await cached(localDate()))}
