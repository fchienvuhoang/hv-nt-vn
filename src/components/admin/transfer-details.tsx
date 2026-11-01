"use client";
import { accountLabel } from "@/lib/account-label";
import {useState} from "react";
import {Modal} from "@/components/modal";
import {useAdminResource} from "@/lib/admin-api";
import type {TransferDetails} from "@/lib/admin-read-model";
import {LoadingIndicator} from "@/components/loading-indicator";
import {dateTime,vnd} from "@/lib/domain";
export function TransferDetailsModal({id,count}:{id:string;count:number}){
 const [opened,setOpened]=useState(false),{data,loading,error}=useAdminResource<TransferDetails>(`transfer-details?id=${id}`,15000,opened);
 return <Modal wide title="Chi tiết các giao dịch điều chuyển" trigger={`Xem ${count} giao dịch`} triggerClassName="button subtle small" onOpen={()=>setOpened(true)} onDismiss={()=>setOpened(false)} footerNote="Lưu nguyên bản chi tiết tại thời điểm điều chuyển, người thực hiện và lý do.">
  {loading&&!data&&<LoadingIndicator label="Đang tải chi tiết điều chuyển…"/>}{error&&<div className="notice danger">{error}</div>}
  {data&&<><div className="notice"><strong>{data.fromFund.code} → {data.toFund.code} · {vnd(data.amount)}</strong><p>{data.reason}</p><small>{data.actorName||data.actor} · {dateTime(data.createdAt)}{data.targetIncome!==null?` · Mức thành tựu: ${vnd(data.targetIncome)}`:""}</small></div><div className="table-scroll table-card allocation-transfer-table"><table><thead><tr><th>Thời gian / TK / mã giao dịch</th><th>Nội dung gốc</th><th className="align-right">Gốc</th><th className="align-right">Chuyển</th><th className="align-right">Nguồn còn</th><th className="align-right">Phần nhận sau</th></tr></thead><tbody>{data.items.map(item=>{const snapshot=item.snapshot as {at?:string;accountNumber?:string;refId?:string;narrative?:string;displayName?:string};return <tr key={item.id}><td>{snapshot.at?dateTime(snapshot.at):"—"}<small>TK {accountLabel(snapshot.accountNumber ?? "")} · {snapshot.refId}</small></td><td><p className="sheet-narrative">{snapshot.narrative}</p><small>{snapshot.displayName}</small></td><td className="money align-right nowrap">{vnd(item.originalAmount)}</td><td className="money align-right nowrap">{vnd(item.amount)}</td><td className="money align-right nowrap">{vnd(item.sourceAfter)}</td><td className="money align-right nowrap">{vnd(item.destinationAfter)}</td></tr>})}</tbody></table></div></>}
 </Modal>;
}
