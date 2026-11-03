"use client";
import type {ReactNode} from "react";
import type {TransferTrail} from "@/lib/allocation";
import {dateTime,vnd} from "@/lib/domain";
export function TransferAllocationInfo({originalAmount,amount,code,trail,details}:{originalAmount:string;amount:string;code:string;trail:TransferTrail;details:(id:string)=>ReactNode}){
 if(!trail.length)return null;
 const active=trail.filter(t=>!t.reversed&&!t.reversal);
 return <div className="transfer-allocation-info"><small>Giao dịch gốc: <b>{vnd(originalAmount)}</b></small>
  {active.map(t=><div key={t.id}>{t.received?"↙ Nhận":"↗ Đã chuyển"} <b>{vnd(t.amount)}</b> {t.received?`từ ${t.from}`:`sang ${t.to}`}</div>)}
  <strong className={BigInt(amount)===0n?"transfer-history-only":""}>{BigInt(amount)===0n?`Chỉ lưu lịch sử · Không tính vào tổng ${code}`:`Còn tính cho ${code}: ${vnd(amount)}`}</strong>
  <details><summary>Lịch sử điều chuyển · {trail.length} lượt</summary>{trail.map(t=><div key={t.id}><span>{t.from} → {t.to} · <b>{vnd(t.amount)}</b>{t.reversal?" · Bút toán đảo":t.reversed?" · Đã đảo":""}</span><small>{dateTime(t.at)}</small>{details(t.id)}</div>)}</details>
 </div>;
}
