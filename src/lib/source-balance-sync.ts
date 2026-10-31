import "server-only";
import { db } from "./db";
import { balanceProfiles,fetchSourceBalance } from "./source-balance";
/** Keep the last successful snapshot if either public source is unavailable. */
export async function refreshSourceBalances(accounts:{id:string;number:string}[]){
  return Promise.all(accounts.filter(a=>balanceProfiles[a.number]).map(async account=>{
    const attemptedAt=new Date();
    try{
      const snapshot=await fetchSourceBalance(account.number);
      await db.bankAccount.update({where:{id:account.id},data:{sourceTotalCredit:snapshot.totalCredit,sourceTotalDebit:snapshot.totalDebit,sourceUpdatedAt:snapshot.updatedAt,sourceFetchedAt:new Date(),sourceAttemptAt:attemptedAt,sourceError:""}});
      return {number:account.number,ok:true};
    }catch(cause){
      const error=cause instanceof Error?cause.message:"Không tải được tổng thu/chi nguồn";
      await db.bankAccount.update({where:{id:account.id},data:{sourceAttemptAt:attemptedAt,sourceError:error.slice(0,250)}});
      return {number:account.number,ok:false,error};
    }
  }));
}
