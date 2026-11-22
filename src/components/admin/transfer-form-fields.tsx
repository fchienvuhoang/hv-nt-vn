"use client";
import { MoneyInput } from "@/components/money-input";
import {transferBalanceError} from "@/lib/transfer-balance";
import {FundPicker} from "./fund-picker";
import { accountLabel } from "@/lib/account-label";
import {useState} from "react";
import {previewTransfer,createAllocationTransfer} from "@/lib/admin-api";
import type {AllocationTransferPreview,AllocationTransferInput} from "@/lib/allocation-transfers";
import {LoadingIndicator,LoadingSpinner} from "@/components/loading-indicator";
import {useToast} from "@/components/toasts";
import {useCloseModal} from "@/components/modal";
import {vnd} from "@/lib/domain";
export function TransferFormFields({requestId,accounts,funds}:{requestId:string;accounts:{id:string;number:string;label:string}[];funds:{id:string;code:string;name:string;income:string;accountId:string;accountIds:string[];byAccount:{accountId:string;balance:string}[]}[]}){
 const [values,setValues]=useState({fromFundId:"",toFundId:"",accountId:"",mode:"AMOUNT",value:"",reason:""}),[preview,setPreview]=useState<AllocationTransferPreview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const toast=useToast(),close=useCloseModal(),source=funds.find(f=>f.id===values.fromFundId),destination=funds.find(f=>f.id===values.toFundId);
 const change=(field:keyof typeof values,value:string)=>{setValues(v=>({...v,[field]:value,...(field==="fromFundId"&&v.toFundId===value?{toFundId:""}:{})}));setPreview(null);setError("")};
 const fundMoney=(fund:typeof source)=>fund&&<span className="transfer-fund-money" aria-live="polite"><span>Số dư hiện có: <strong>{vnd(fund.byAccount.reduce((sum,a)=>sum+BigInt(a.balance),0n))}</strong></span><span>Tổng hùn phước: <strong>{vnd(fund.income)}</strong></span></span>;
 const input=():AllocationTransferInput=>({...values,mode:values.mode as AllocationTransferInput["mode"],accountId:values.accountId||undefined});
 const amount=values.value&&/^\d+$/.test(values.value)?values.mode==="AMOUNT"?BigInt(values.value):BigInt(source?.income??"0")-BigInt(values.value):null;
 const balanceError=source?transferBalanceError(source.byAccount,amount,values.accountId||undefined,true):null;
 const totals=preview?[...preview.items,...preview.balanceItems].reduce((sum,item)=>({before:sum.before+BigInt(item.sourceBefore),amount:sum.amount+BigInt(item.amount),after:sum.after+BigInt(item.sourceAfter)}),{before:0n,amount:0n,after:0n}):null;
 async function check(event:React.FormEvent){event.preventDefault();if(balanceError){setPreview(null);setError(balanceError);return}setBusy(true);setError("");try{setPreview(await previewTransfer(input()))}catch(error){const message=error instanceof Error?error.message:"Không kiểm tra được điều chuyển";setError(message);toast(message,"error")}finally{setBusy(false)}}
 async function apply(){if(!preview)return;setBusy(true);setError("");try{const result=await createAllocationTransfer({...input(),requestId,fingerprint:preview.fingerprint});if(result.error){setError(result.error);toast(result.error,"error")}else if(result.success){toast(result.success,"success");close?.()}}finally{setBusy(false)}}
 return <div className="allocation-transfer-workspace"><form onSubmit={check} className="action-form"><fieldset disabled={busy} className="action-fields">
  <div className="form-row"><label>Thiện pháp nguồn<FundPicker label="Thiện pháp nguồn" required funds={funds} accounts={accounts} value={values.fromFundId} onChange={id=>change("fromFundId",id)}/>{fundMoney(source)}</label><label>Thiện pháp nhận<FundPicker label="Thiện pháp nhận" required funds={funds.filter(f=>f.id!==values.fromFundId)} accounts={accounts} value={values.toFundId} onChange={id=>change("toFundId",id)}/>{fundMoney(destination)}</label></div>
  {(source||destination)&&<small className="transfer-fund-verification">Số tiền được xác minh lại khi xem trước và xác nhận.</small>}
  <div className="form-row"><label>Cách tính<select value={values.mode} onChange={e=>change("mode",e.target.value)}><option value="AMOUNT">Nhập số tiền cần cắt</option><option value="TARGET_INCOME">Đưa tổng hùn phước về mức thành tựu</option></select></label><label>{values.mode==="AMOUNT"?"Số tiền cần chuyển (VND)":"Tổng hùn phước cần giữ lại (VND)"}<MoneyInput required value={values.value} onValueChange={value=>change("value",value)} placeholder={values.mode==="AMOUNT"?"2.000.000":"90.000.000"}/></label></div>
  <label>Phạm vi tài khoản<select value={values.accountId} onChange={e=>change("accountId",e.target.value)}><option value="">Cả hai tài khoản</option>{accounts.map(a=><option key={a.id} value={a.id}>{accountLabel(a.number)} · {a.label}</option>)}</select></label>
  <label>Lý do điều chuyển<textarea required minLength={5} maxLength={1000} rows={2} value={values.reason} onChange={e=>change("reason",e.target.value)}/></label>
  <div className="notice">Cho phép điều chuyển kể cả khi thiện pháp nguồn đang âm hoặc không đủ số dư. Chỉ điều chuyển số dư, không chuyển danh sách thí chủ hay phân bổ lại giao dịch gốc. Thiện pháp nhận có thể chỉ cấu hình một tài khoản. Tiền vẫn được ghi nhận tại tài khoản ngân hàng gốc; không chuyển tiền giữa các tài khoản. Lưu đầy đủ lịch sử điều chuyển.</div>
  {balanceError&&<div className="notice danger" role="alert">{balanceError}</div>}
  <button className="button subtle" type="submit" disabled={busy||!!balanceError}>{busy?<><LoadingSpinner size={20}/>Đang xử lý…</>:"Xem trước số dư điều chuyển"}</button>
 </fieldset></form>
 {error&&<div className="notice danger" role="alert">{error}</div>}
 {busy&&!preview&&<LoadingIndicator label="Đang kiểm tra số dư điều chuyển…"/>}
 {preview&&<section className="allocation-transfer-preview"><div className="notice"><strong>{preview.fromCode} → {preview.toCode}: {vnd(preview.amount)}</strong><p>Số dư nguồn: {vnd(preview.sourceBalanceBefore)} → <b>{vnd(preview.sourceBalanceAfter)}</b> · Số dư bên nhận: {vnd(preview.destinationBalanceBefore)} → <b>{vnd(preview.destinationBalanceAfter)}</b></p><small>Điều chuyển số dư trên {preview.balanceItems.length} tài khoản. Danh sách hùn phước và phương danh giữ nguyên.</small></div>
  <div className="table-scroll table-card allocation-transfer-table"><table><thead><tr><th>Tài khoản gốc</th><th className="align-right">Số dư nguồn trước</th><th className="align-right">Chuyển đi</th><th className="align-right">Nguồn còn lại</th><th className="align-right">Bên nhận sau chuyển</th></tr></thead><tbody>{preview.balanceItems.map(item=><tr key={item.accountId}><td>TK {accountLabel(item.accountNumber)}</td><td className="money align-right nowrap">{vnd(item.sourceBefore)}</td><td className="money align-right nowrap">{vnd(item.amount)}</td><td className="money align-right nowrap">{vnd(item.sourceAfter)}</td><td className="money align-right nowrap">{vnd(item.destinationAfter)}</td></tr>)}</tbody>{totals&&<tfoot><tr><th scope="row">Tổng cộng</th><td className="money align-right nowrap">{vnd(totals.before)}</td><td className="money align-right nowrap">{vnd(totals.amount)}</td><td className="money align-right nowrap">{vnd(totals.after)}</td><td>{totals.amount===BigInt(preview.amount)?"Khớp số tiền chuyển":"Tổng chưa khớp"}</td></tr></tfoot>}</table></div>
  <button className="button primary" type="button" onClick={apply} disabled={busy}>{busy?<><LoadingSpinner size={20}/>Đang lưu…</>:`Xác nhận chuyển đúng ${vnd(preview.amount)}`}</button>
 </section>}
 </div>;
}
