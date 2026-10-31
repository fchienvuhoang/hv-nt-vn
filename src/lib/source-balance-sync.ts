import "server-only";
import { db } from "./db";
import { balanceProfiles,fetchSourceBalance } from "./source-balance";
import type {BankAccount} from "@/generated/prisma/client";
type BalanceAccount=Pick<BankAccount,"id"|"number">&Partial<Pick<BankAccount,"sourceTotalCredit"|"sourceTotalDebit"|"sourceFetchedAt"|"sourceAttemptAt"|"sourceError">>;
const HEARTBEAT_MS=5*60*1000;
/** Fetch every invocation; persist changes immediately and unchanged snapshots every five minutes. */
export async function refreshSourceBalances(accounts:BalanceAccount[],now=new Date()){
  return Promise.all(accounts.filter(a=>balanceProfiles[a.number]).map(async account=>{
    try{
      const snapshot=await fetchSourceBalance(account.number);
      const persisted=account.sourceTotalCredit!==snapshot.totalCredit||account.sourceTotalDebit!==snapshot.totalDebit||!!account.sourceError||!account.sourceFetchedAt||now.getTime()-account.sourceFetchedAt.getTime()>=HEARTBEAT_MS;
      if(persisted)await db.bankAccount.update({where:{id:account.id},data:{sourceTotalCredit:snapshot.totalCredit,sourceTotalDebit:snapshot.totalDebit,sourceUpdatedAt:snapshot.updatedAt,sourceFetchedAt:now,sourceAttemptAt:now,sourceError:""}});
      return {number:account.number,ok:true,persisted};
    }catch(cause){
      const error=(cause instanceof Error?cause.message:"Không tải được tổng thu/chi nguồn").slice(0,250);
      const persisted=account.sourceError!==error||!account.sourceAttemptAt||now.getTime()-account.sourceAttemptAt.getTime()>=HEARTBEAT_MS;
      if(persisted)await db.bankAccount.update({where:{id:account.id},data:{sourceAttemptAt:now,sourceError:error}});
      return {number:account.number,ok:false,error,persisted};
    }
  }));
}
