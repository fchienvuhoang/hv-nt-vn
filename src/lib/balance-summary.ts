/** Preserve the signed ledger value; split only its presentation. */
export function splitBalance(balance:bigint){return {availableBalance:balance>0n?balance:0n,excessExpense:balance<0n?-balance:0n}}
export function summarizeBalances(rows:readonly {balance:bigint}[]){
 return rows.reduce<{availableBalance:bigint;excessExpense:bigint;balance:bigint}>((sum,row)=>{const parts=splitBalance(row.balance);return {availableBalance:sum.availableBalance+parts.availableBalance,excessExpense:sum.excessExpense+parts.excessExpense,balance:sum.balance+row.balance}},{availableBalance:0n,excessExpense:0n,balance:0n});
}
