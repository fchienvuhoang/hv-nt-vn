"use client";
import { accountLabel } from "@/lib/account-label";
import {useState} from "react";
import {previewTransfer,createAllocationTransfer} from "@/lib/admin-api";
import type {AllocationTransferPreview,AllocationTransferInput} from "@/lib/allocation-transfers";
import {LoadingIndicator,LoadingSpinner} from "@/components/loading-indicator";
import {useToast} from "@/components/toasts";
import {useCloseModal} from "@/components/modal";
import {vnd,dateTime} from "@/lib/domain";
export function TransferFormFields({requestId,accounts,funds}:{requestId:string;accounts:{id:string;number:string;label:string}[];funds:{id:string;code:string;name:string;income:string;accountId:string;accountIds:string[];byAccount:{accountId:string;balance:string}[]}[]}){
 const [values,setValues]=useState({fromFundId:"",toFundId:"",accountId:"",mode:"AMOUNT",value:"",reason:""}),[preview,setPreview]=useState<AllocationTransferPreview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const toast=useToast(),close=useCloseModal(),source=funds.find(f=>f.id===values.fromFundId);
 const change=(field:keyof typeof values,value:string)=>{setValues(v=>({...v,[field]:value}));setPreview(null);setError("")};
 const input=():AllocationTransferInput=>({...values,mode:values.mode as AllocationTransferInput["mode"],accountId:values.accountId||undefined});
 async function check(event:React.FormEvent){event.preventDefault();setBusy(true);setError("");try{setPreview(await previewTransfer(input()))}catch(error){const message=error instanceof Error?error.message:"Không kiểm tra được điều chuyển";setError(message);toast(message,"error")}finally{setBusy(false)}}
 async function apply(){if(!preview)return;setBusy(true);setError("");try{const result=await createAllocationTransfer({...input(),requestId,fingerprint:preview.fingerprint});if(result.error){setError(result.error);toast(result.error,"error")}else if(result.success){toast(result.success,"success");close?.()}}finally{setBusy(false)}}
 return <div className="allocation-transfer-workspace"><form onSubmit={check} className="action-form"><fieldset disabled={busy} className="action-fields">
  <div className="form-row"><label>Thiện pháp nguồn<select required value={values.fromFundId} onChange={e=>change("fromFundId",e.target.value)}><option value="">Chọn thiện pháp</option>{funds.map(f=><option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}</select></label><label>Thiện pháp nhận<select required value={values.toFundId} onChange={e=>change("toFundId",e.target.value)}><option value="">Chọn thiện pháp</option>{funds.filter(f=>f.id!==values.fromFundId).map(f=><option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}</select></label></div>
  {source&&<div className="notice">Tổng hùn phước hiện tại của {source.code}: <strong>{vnd(source.income)}</strong>. Số tiền được xác minh lại khi xem trước và xác nhận.</div>}
  <div className="form-row"><label>Cách tính<select value={values.mode} onChange={e=>change("mode",e.target.value)}><option value="AMOUNT">Nhập số tiền cần cắt</option><option value="TARGET_INCOME">Đưa tổng hùn phước về mức thành tựu</option></select></label><label>{values.mode==="AMOUNT"?"Số tiền cần chuyển (VND)":"Tổng hùn phước cần giữ lại (VND)"}<input required value={values.value} onChange={e=>change("value",e.target.value)} inputMode="numeric" pattern="[0-9]{1,15}" maxLength={15} placeholder={values.mode==="AMOUNT"?"2000000":"90000000"}/></label></div>
  <label>Phạm vi tài khoản<select value={values.accountId} onChange={e=>change("accountId",e.target.value)}><option value="">Cả hai tài khoản</option>{accounts.map(a=><option key={a.id} value={a.id}>{accountLabel(a.number)} · {a.label}</option>)}</select></label>
  <label>Lý do điều chuyển<textarea required minLength={5} maxLength={1000} rows={2} value={values.reason} onChange={e=>change("reason",e.target.value)}/></label>
  <div className="notice">Chọn ngược từ các khoản hùn phước mới nhất, tách khoản cuối nếu cần để chuyển đúng số tiền. Giữ nguyên giao dịch ngân hàng và tài khoản; ghi chú điều chuyển được hiển thị công khai.</div>
  <button className="button subtle" type="submit" disabled={busy}>{busy?<><LoadingSpinner size={20}/>Đang xử lý…</>:"Xem trước các khoản sẽ chuyển"}</button>
 </fieldset></form>
 {error&&<div className="notice danger" role="alert">{error}</div>}
 {busy&&!preview&&<LoadingIndicator label="Đang tính các khoản hùn phước cần cắt…"/>}
 {preview&&<section className="allocation-transfer-preview"><div className="notice"><strong>{preview.fromCode} → {preview.toCode}: {vnd(preview.amount)}</strong><p>Tổng hùn phước nguồn: {vnd(preview.incomeBefore)} → <b>{vnd(preview.incomeAfter)}</b> · Thiện pháp nhận sau điều chuyển: <b>{vnd(preview.destinationIncomeAfter)}</b></p><small>{preview.items.length} giao dịch · Các dòng dưới là toàn bộ các khoản dự kiến, không phải dữ liệu mẫu.</small></div>
  <div className="table-scroll table-card allocation-transfer-table"><table><thead><tr><th>Thời gian / tài khoản</th><th>Nội dung giao dịch gốc</th><th className="align-right">Phần nguồn trước</th><th className="align-right">Chuyển đi</th><th className="align-right">Nguồn giữ lại</th><th>Xử lý</th></tr></thead><tbody>{preview.items.map(item=><tr key={item.transactionId}><td>{dateTime(item.at)}<small>TK {accountLabel(item.accountNumber)} · {item.refId}</small></td><td><p className="sheet-narrative">{item.narrative||"Không có nội dung"}</p><small>{item.displayName} · Gốc {vnd(item.originalAmount)}</small></td><td className="money align-right nowrap">{vnd(item.sourceBefore)}</td><td className="money align-right nowrap">{vnd(item.amount)}</td><td className="money align-right nowrap">{vnd(item.sourceAfter)}</td><td>{item.split?<span className="badge pending">Tách phần hùn phước</span>:"Chuyển toàn bộ phần nguồn"}</td></tr>)}</tbody></table></div>
  <button className="button primary" type="button" onClick={apply} disabled={busy}>{busy?<><LoadingSpinner size={20}/>Đang lưu…</>:`Xác nhận chuyển đúng ${vnd(preview.amount)}`}</button>
 </section>}
 </div>;
}
