"use client";
import { useEffect,useState } from "react";
import { decodeAdmin } from "./admin-codec";
import type * as Actions from "@/app/admin/actions";
const entries=new Map<string,{data:unknown;at:number}>(),pending=new Map<string,Promise<unknown>>();
let loginRedirect=false;
export async function adminRequest<T>(path:string,init:RequestInit={}):Promise<T>{
  const response=await fetch(`/api/admin/${path}`,{...init,credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json",...init.headers}});
  if(!response.headers.get("content-type")?.includes("application/json"))throw new Error("Máy chủ chưa trả về dữ liệu JSON hợp lệ. Vui lòng thử lại.");
  const data=decodeAdmin<T&{error?:string}>(await response.json());
  if(response.status===401||response.status===403){entries.clear();if(!loginRedirect){loginRedirect=true;
    // Clear authenticated memory and the document when a session expires.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }throw new Error(data.error??"Không có quyền quản trị")}
  if(!response.ok)throw new Error(data.error??"Không tải được dữ liệu");
  return data;
}
function read<T>(path:string,ttl:number,force=false):Promise<T>{
  const cached=entries.get(path);
  if(!force&&cached&&Date.now()-cached.at<ttl)return Promise.resolve(cached.data as T);
  const existing=pending.get(path);if(existing)return existing as Promise<T>;
  const promise=adminRequest<T>(path).then(data=>{entries.set(path,{data,at:Date.now()});if(entries.size>50)entries.delete(entries.keys().next().value!);return data}).finally(()=>pending.delete(path));
  pending.set(path,promise);return promise;
}
type Revision={ledger:string;source:string;sync:string;day:string};
function resourceRevision(path:string,version:Revision){
 if(path.startsWith("sync?"))return version.sync+version.ledger;
 if(path==="bootstrap"||path==="transaction-summary")return version.ledger+version.source+version.day;
 return version.ledger+version.day;
}
export function useAdminResource<T>(path:string,ttl=15000,enabled=true,keepPreviousData=false){
  const [state,setState]=useState<{key:string;data?:T;error?:string;loading:boolean}>(()=>({key:path,data:entries.get(path)?.data as T|undefined,loading:true}));
  useEffect(()=>{
    if(!enabled)return;
    let alive=true,sequence=0,lastRevision:string|undefined,checking=false;
    async function load(force=false){const current=++sequence;setState(previous=>({key:path,data:previous.key===path?previous.data:(entries.get(path)?.data as T|undefined)??(keepPreviousData?previous.data:undefined),loading:true}));try{const data=await read<T>(path,ttl,force);if(alive&&current===sequence)setState({key:path,data,loading:false});return true}catch(cause){if(alive&&current===sequence)setState(previous=>({...previous,loading:false,error:cause instanceof Error?cause.message:"Không tải được dữ liệu"}));return false}}
    void load();
    async function check(){
      if(document.hidden||checking)return;checking=true;
      try{
        const version=resourceRevision(path,await read<Revision>("revision",15000));
        if(!alive)return;
        if(!entries.has(path)||lastRevision!==undefined&&lastRevision!==version){if(!await load(true))return;}
        lastRevision=version;
      }catch{/* Keep existing data on a transient version-check failure. */}
      finally{checking=false;}
    }
    void check();
    const refresh=()=>{if(!document.hidden)void load(true)},visible=()=>{
      if(!document.hidden&&Date.now()-(entries.get(path)?.at??0)>ttl)void check();
    };
    window.addEventListener("admin:data-changed",refresh);document.addEventListener("visibilitychange",visible);
    const timer=setInterval(visible,60000);
    return()=>{alive=false;clearInterval(timer);window.removeEventListener("admin:data-changed",refresh);document.removeEventListener("visibilitychange",visible)};
  },[path,ttl,enabled,keepPreviousData]);
  return state.key===path?state:{key:path,data:(entries.get(path)?.data as T|undefined)??(keepPreviousData?state.data:undefined),loading:true,error:undefined};
}
export function refreshAdminData(){for(const entry of entries.values())entry.at=0;window.dispatchEvent(new Event("admin:data-changed"));
 if(typeof BroadcastChannel!=="undefined"){const channel=new BroadcastChannel("hvntvn-ledger");channel.postMessage("changed");channel.close();}
}
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleAdminRefresh() {
  // Invalidate immediately; notify on the next task so the save caller can close its dialog first.
  for (const entry of entries.values()) entry.at = 0;
  if (refreshTimer !== undefined) return;
  refreshTimer = setTimeout(() => { refreshTimer = undefined; refreshAdminData(); }, 0);
}
async function write<T>(path:string,method:string,body:FormData|object,notify=true):Promise<T>{
  try {
  const isForm=body instanceof FormData;
  const result=await adminRequest<T&{error?:string;fieldErrors?:unknown}>(path,{method,body:isForm?body:JSON.stringify(body),headers:isForm?{}:{"Content-Type":"application/json"}});
  if(!result.error&&!result.fieldErrors){
    if(notify)scheduleAdminRefresh();
    else for(const [key,entry] of entries)if(key.startsWith("sync?"))entry.at=0;
  }
  return result;
  } catch(cause) { return {error:cause instanceof Error?cause.message:"Kết nối bị gián đoạn, vui lòng thử lại."} as T; }
}
type Result<K extends keyof typeof Actions>=Awaited<ReturnType<(typeof Actions)[K]>>;
export const setFundVisibility=(_s:Actions.ActionState,f:FormData)=>write<Result<"setFundVisibility">>("funds/visibility","PATCH",f);
export const pinFund=(_s:Actions.ActionState,f:FormData)=>write<Result<"pinFund">>("funds/pin","PATCH",f);
export const saveFund=(_s:Actions.ActionState,f:FormData)=>write<Result<"saveFund">>("funds",f.get("id")?"PUT":"POST",f);
export const assignTransaction=(_s:Actions.ActionState,f:FormData)=>write<Result<"assignTransaction">>("transactions/assignment","POST",f);
export const createTransfer=(_s:Actions.ActionState,f:FormData)=>write<Result<"createTransfer">>("transfers","POST",f);
export const reverseTransfer=(_s:Actions.ActionState,f:FormData)=>write<Result<"reverseTransfer">>("transfers/reversal","POST",f);
export const saveTransactionNote=(_s:Actions.ActionState,f:FormData)=>write<Result<"saveTransactionNote">>("transaction-notes","POST",f);
export const resolveDuplicate=(_s:Actions.ActionState,f:FormData)=>write<Result<"resolveDuplicate">>("transactions/review","POST",f);
export const uploadFundExcel=(_s:Actions.ExcelUploadState,f:FormData)=>write<Result<"uploadFundExcel">>("imports","POST",f,false);
export const commitFundExcel=(input:Parameters<typeof Actions.commitFundExcel>[0])=>write<Result<"commitFundExcel">>("imports/commit","POST",input);
export const bulkAssignTransactions=(input:Parameters<typeof Actions.bulkAssignTransactions>[0])=>write<Result<"bulkAssignTransactions">>("transactions/assignments","POST",input);
export const addTransactionNote=(input:Parameters<typeof Actions.addTransactionNote>[0])=>{const f=new FormData();for(const [k,v] of Object.entries(input))f.set(k,v);return write<Result<"addTransactionNote">>("transaction-notes","POST",f)};
export const getFundImportHistory=(fundId:string)=>adminRequest<Result<"getFundImportHistory">>(`imports?${new URLSearchParams({fundId})}`);
export const getFundTransactions=(input:Parameters<typeof Actions.getFundTransactions>[0],force=false)=>read<Result<"getFundTransactions">>(`fund-transactions?${new URLSearchParams(Object.entries(input).filter(([,v])=>v!==undefined).map(([k,v])=>[k,String(v)]))}`,15000,force);
export const startReclassification=(scope:Parameters<typeof Actions.startReclassification>[0])=>write<Result<"startReclassification">>("reclassification","POST",scope,false);
export const advanceReclassification=(input:Parameters<typeof Actions.advanceReclassification>[0])=>write<Result<"advanceReclassification">>("reclassification","PATCH",input,input.phase==="APPLY");
export const getLatestReclassification=(scope:Parameters<typeof Actions.getLatestReclassification>[0])=>adminRequest<Result<"getLatestReclassification">>(`reclassification?${new URLSearchParams({scope:JSON.stringify(scope)})}`);

export const previewTransfer=(input:import("./allocation-transfers").AllocationTransferInput)=>adminRequest<import("./allocation-transfers").AllocationTransferPreview>("transfers/preview",{method:"POST",body:JSON.stringify(input),headers:{"Content-Type":"application/json"}});
export const createAllocationTransfer=(input:Parameters<typeof Actions.createAllocationTransfer>[0])=>write<Result<"createAllocationTransfer">>("transfers/allocate","POST",input);

export const splitBankTransaction=(input:import("./transaction-split-input").TransactionSplitInput)=>write<Result<"splitBankTransaction">>("transactions/split","POST",input);
