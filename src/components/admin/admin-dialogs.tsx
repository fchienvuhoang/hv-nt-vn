import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { fundTotals } from "@/lib/ledger";
import { listFundImports } from "@/lib/fund-imports";
import { DialogWorkspace } from "./dialog-workspace";
import type { AdminParams, AdminView } from "@/lib/admin-navigation";
export async function AdminDialogs({view,params,children}:{view:AdminView;params:AdminParams;children:ReactNode}) {
  const [accounts,funds,totals]=await Promise.all([
    db.bankAccount.findMany({select:{id:true,number:true,label:true},orderBy:{number:"asc"}}),
    view==="funds"?db.fund.findMany({orderBy:{code:"asc"}}):Promise.resolve([]),
    view==="transfers"?fundTotals():Promise.resolve([]),
  ]);
  const kind=["create-fund","edit-fund","import-fund","transfer"].includes(params.modal??"")?params.modal as "create-fund"|"edit-fund"|"import-fund"|"transfer":null;
  return <DialogWorkspace key={view} accounts={accounts} funds={funds} transferFunds={totals.map(f=>({id:f.id,code:f.code,name:f.name,accountId:f.accountId,accountIds:f.accountIds,byAccount:f.byAccount.map(a=>({accountId:a.accountId,balance:a.balance.toString()}))}))} initial={kind?{kind,fundId:params.fundId}:null} initialRequestId={randomUUID()} initialHistory={kind==="import-fund"&&params.fundId?await listFundImports(params.fundId):[]}>
    {children}
  </DialogWorkspace>;
}
