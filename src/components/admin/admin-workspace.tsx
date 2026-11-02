"use client";
import type { FormEvent } from "react";
import { useMemo } from "react";
import { DialogWorkspace } from "./dialog-workspace";
import Funds from "./views/funds";
import Transactions from "./views/transactions";
import Transfers from "./views/transfers";
import Sync from "./views/sync";
import Statistics from "./views/statistics";
import { getAdminView } from "@/lib/admin-navigation";
import { useAdminParams,adminNavigate } from "./admin-link";
import { useAdminResource,refreshAdminData } from "@/lib/admin-api";
import type { AdminBootstrap } from "@/lib/admin-read-model";
export default function AdminWorkspace(){
  const params=useAdminParams(),view=getAdminView(params.view),{data,error}=useAdminResource<AdminBootstrap>("bootstrap",20000);
  const transferFunds=useMemo(()=>data?.funds.map(f=>({id:f.id,code:f.code,name:f.name,income:f.income.toString(),accountId:f.accountId,accountIds:f.accountIds,byAccount:f.byAccount.map(a=>({accountId:a.accountId,balance:a.balance.toString()}))}))??[],[data]);
  function submit(event:FormEvent<HTMLDivElement>){const form=event.target as HTMLFormElement;if(!form.classList.contains("filter-bar")||form.method.toLowerCase()!=="get"||new URL(form.action,window.location.href).pathname!=="/admin")return;event.preventDefault();const query=new URLSearchParams();for(const [key,value] of new FormData(form))if(typeof value==="string"&&value)query.set(key,value);query.delete("page");adminNavigate(`/admin?${query}`)}
  return <DialogWorkspace funds={data?.funds??[]} accounts={data?.accounts??[]} transferFunds={transferFunds} initial={null} initialHistory={[]} initialRequestId="initial-request">
    <div className="admin-client-workspace" onSubmitCapture={submit}>
      <div id="admin-push-card"/>
      {error&&<div className="notice danger" role="alert">{error} <button className="button subtle small" onClick={refreshAdminData}>Thử lại dữ liệu</button></div>}
      {view==="funds"?<Funds params={params} bootstrap={data}/>:view==="transactions"?<Transactions params={params} bootstrap={data}/>:view==="statistics"?<Statistics params={params} bootstrap={data}/>:view==="transfers"?<Transfers/>:<Sync params={params} bootstrap={data}/>}
    </div>
  </DialogWorkspace>;
}
