"use client";
import {useState} from "react";
import {Modal} from "@/components/modal";
import {LoadingIndicator} from "@/components/loading-indicator";
import {accountLabel} from "@/lib/account-label";
import {dateTime,vnd} from "@/lib/domain";
import type {PublicTransferDetails} from "@/lib/public-transfer-details";
const cached=new Map<string,{data:PublicTransferDetails;at:number}>(),pending=new Map<string,Promise<PublicTransferDetails>>();
function load(url:string){
 const old=cached.get(url);if(old&&Date.now()-old.at<15000)return Promise.resolve(old.data);
 const active=pending.get(url);if(active)return active;
 const task=fetch(url,{cache:"no-store"}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error??"Chưa tải được điều chuyển");cached.set(url,{data,at:Date.now()});if(cached.size>30)cached.delete(cached.keys().next().value!);return data as PublicTransferDetails}).finally(()=>pending.delete(url));
 pending.set(url,task);return task;
}
export function PublicTransferDetailsModal({slug,id,revision}:{slug:string;id:string;revision:string}){
 const [data,setData]=useState<PublicTransferDetails|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function open(){setBusy(true);setError("");try{setData(await load(`/api/public/funds/${encodeURIComponent(slug)}/transfers/${encodeURIComponent(id)}?revision=${encodeURIComponent(revision)}`))}catch(e){setError(e instanceof Error?e.message:"Chưa tải được chi tiết")}finally{setBusy(false)}}
 return <Modal wide title="Chi tiết điều chuyển" trigger="Chi tiết điều chuyển" triggerClassName="button subtle small" onOpen={()=>void open()} footerNote="Các số liệu là lịch sử tại thời điểm điều chuyển; không cộng thêm vào tổng hiện tại.">
  {busy&&<LoadingIndicator label="Đang tải chi tiết điều chuyển…"/>}{error&&<div className="notice danger">{error}<button type="button" className="button subtle small" onClick={()=>void open()}>Thử lại</button></div>}
  {data&&<><div className="notice"><strong>{data.from} → {data.to} · {vnd(data.amount)}</strong><p>{data.reason}</p><small>{dateTime(data.at)}{data.reversal?" · Bút toán đảo":data.reversed?" · Đã đảo":""}</small></div><div className="table-scroll table-card allocation-transfer-table public-transfer-details-table"><table><thead><tr><th>Thời gian / tài khoản</th><th>Nội dung</th><th className="align-right">Giao dịch gốc</th><th className="align-right">Chuyển</th><th className="align-right">Nguồn còn</th><th className="align-right">Bên nhận sau</th></tr></thead><tbody>
   {data.items.map(i=><tr key={i.id}><td>{i.at?dateTime(i.at):"—"}<small>TK {accountLabel(i.account)}</small></td><td>{i.narrative}</td><td className="money align-right nowrap">{vnd(i.originalAmount)}</td><td className="money align-right nowrap">{vnd(i.amount)}</td><td className="money align-right nowrap">{vnd(i.sourceAfter)}</td><td className="money align-right nowrap">{vnd(i.destinationAfter)}</td></tr>)}
   {data.balanceItems.map(i=><tr key={i.id}><td>TK {accountLabel(i.account)}</td><td>Số dư chuyển sang / khả dụng</td><td>—</td><td className="money align-right nowrap">{vnd(i.amount)}</td><td className="money align-right nowrap">{vnd(i.sourceAfter)}</td><td className="money align-right nowrap">{vnd(i.destinationAfter)}</td></tr>)}
  </tbody><tfoot><tr><th colSpan={3} scope="row">Tổng điều chuyển</th><td className="money align-right nowrap">{vnd([...data.items,...data.balanceItems].reduce((sum,i)=>sum+BigInt(i.amount),0n))}</td><td colSpan={2}>Đã gồm khoản thu và số dư</td></tr></tfoot></table></div></>}
 </Modal>;
}
