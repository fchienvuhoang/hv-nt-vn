"use client";
import { useEffect, useRef, useState } from "react";
import { dateTime, vnd } from "@/lib/domain";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toasts";
import { startReclassification, advanceReclassification, getLatestReclassification } from "@/lib/admin-api";
import type { ReclassificationScope, ReclassificationSummary } from "@/lib/reclassify";
export function TabReclassification({scope,initial,label,filterLabel}:{scope:ReclassificationScope;initial:ReclassificationSummary|null;label:string;filterLabel:string}) {
  const [run,setRun]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [loadingRun,setLoadingRun]=useState(false);
  const readRequest=useRef(0);
  const alive=useRef(true),stop=useRef(false);
  const toast=useToast();
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;stop.current=true}},[]);
  async function loadLatest(){
    if(busy)return;
    const request=++readRequest.current;
    setLoadingRun(true);setError("");
    try{
      const result=await getLatestReclassification(scope);
      if(!alive.current||request!==readRequest.current)return;
      if(result.error)throw new Error(result.error);
      setRun(result.run??null);
    }catch(cause){if(alive.current&&request===readRequest.current){const message=cause instanceof Error?cause.message:"Không tải được tiến độ phân loại";setError(message);toast(message,"error")}}
    finally{if(alive.current&&request===readRequest.current)setLoadingRun(false)}
  }
  async function perform(mode:"NEW"|"CHECK"|"APPLY") {
    stop.current=false;setBusy(true);setError("");
    try {
      let current=run;
      const phase=mode==="APPLY"?"APPLY":"CHECK";
      if(mode==="NEW"){
        const result=await startReclassification(scope);
        if(result.error||!result.run)throw new Error(result.error||"Không thể khởi tạo lượt kiểm tra");
        current=result.run;if(alive.current)setRun(current);
      }
      if(!current)throw new Error("Chưa có lượt kiểm tra");
      while(alive.current&&!stop.current&&!["COMPLETE","STALE"].includes(current.status)){
        if(phase==="CHECK"&&current.status!=="CHECKING")break;
        const result=await advanceReclassification({id:current.id,phase});
        if(result.error||!result.run)throw new Error(result.error||"Không thể tiếp tục");
        current=result.run;if(alive.current)setRun(current);
      }
      if(!alive.current)return;
      if(current.status==="STALE")toast(current.error||"Cấu hình đã thay đổi. Cần kiểm tra lại.","error");
      else if(current.status==="COMPLETE")toast(`Đã ${phase==="APPLY"?"áp dụng":"kiểm tra"} xong: ${current.applied} thay đổi đã lưu; giữ nguyên ${current.manualProtected} khoản gán tay, ${current.unchanged} khoản đã đúng. ${current.conflicted} khoản vừa thay đổi được bỏ qua.`);
      else if(phase==="CHECK"&&current.status==="APPLYING")toast("Lượt kiểm tra này đang được áp dụng ở phiên khác. Có thể mở lại để xem tiến độ.");
      else if(stop.current)toast("Đã dừng sau lô hiện tại. Mở lại để tiếp tục từ tiến độ đã lưu.");
      else toast(`Đã kiểm tra ${current.checked} giao dịch. Có ${current.changes} thay đổi cần bạn xác nhận.`);
    } catch(cause){if(alive.current){const message=cause instanceof Error?cause.message:"Kết nối bị gián đoạn. Có thể tiếp tục từ tiến độ đã lưu.";setError(message);toast(message,"error")}}
    finally{if(alive.current)setBusy(false)}
  }
  const active=run&&["CHECKING","READY","APPLYING"].includes(run.status);
  return <Modal wide title={`Kiểm tra phân loại · ${label}`} trigger="Kiểm tra phân loại tab" triggerClassName="button primary small" footerNote="Đóng modal sẽ dừng sau lô hiện tại. Tiến độ đã lưu có thể tiếp tục." onOpen={loadLatest} onDismiss={()=>{stop.current=true;readRequest.current++}}>
    {loadingRun&&<p role="status">Đang tải tiến độ kiểm tra gần nhất…</p>}
    <div className="notice">Chỉ kiểm tra tab <strong>{label}</strong> trong khoảng {scope.from} → {scope.to}, {filterLabel}. Bao gồm toàn bộ các trang, không chỉ 100 dòng đang hiển thị.</div>
    <p className="reclassify-explanation">Giao dịch gán thủ công luôn được giữ nguyên. Các giao dịch tự động sẽ được đối chiếu với toàn bộ mã/từ khóa hiện tại: có thể chuyển sang thiện pháp phù hợp khác hoặc về Chưa phân loại nếu không còn khớp. <strong>Kiểm tra chưa làm thay đổi giao dịch; chỉ áp dụng sau khi bạn xác nhận.</strong></p>
    {run&&<>
      <div className="reclassify-summary">
        <span>Đã kiểm tra <strong>{run.checked}/{run.total}</strong></span>
        <span>Gán tay giữ nguyên <strong>{run.manualProtected}</strong></span>
        <span>Nghi trùng bỏ qua <strong>{run.reviewProtected}</strong></span>
        <span>Đã đúng <strong>{run.unchanged}</strong></span>
        <span>Dự kiến thay đổi <strong>{run.changes}</strong></span>
        <span>Đã áp dụng <strong>{run.applied}</strong></span>
        <span>Vừa bị sửa — giữ nguyên <strong>{run.conflicted}</strong></span>
      </div>
      <progress className="reclassify-progress" max={Math.max(1,run.status==="APPLYING"?run.changes:run.total)} value={run.status==="APPLYING"?run.applied:run.checked} />
      <p className="muted">Không khớp: {run.noMatch} · Mã tạm dừng/hoàn thành: {run.inactive} · Khớp nhiều thiện pháp: {run.ambiguous}. Khoản đã gán đúng cho thiện pháp tạm dừng/hoàn thành được giữ, không tự gán thêm.</p>
      {run.changeDetails.length>0&&<div className="reclassify-change-list"><p className="reclassify-list-count"><strong>Toàn bộ {run.changeDetails.length} thay đổi</strong> · Đối chiếu nội dung và thiện pháp trước khi xác nhận.</p><div className="table-scroll table-card reclassify-preview"><table><thead><tr><th>STT</th><th>Nội dung chuyển khoản / giao dịch</th><th>Số tiền</th><th>Trước phân loại</th><th>Sau phân loại</th><th>Lý do / trạng thái</th></tr></thead><tbody>{run.changeDetails.map((row,index)=><tr key={row.id}>
        <td>{index+1}</td>
        <td>{row.transaction?<><div className="reclassify-narrative">{row.transaction.narrative||"Không có nội dung chuyển khoản"}</div>{row.transaction.displayName&&<div className="reclassify-sender">{row.transaction.displayName}</div>}<small>{dateTime(row.transaction.occurredAt)} · TK {row.transaction.accountNumber}{row.transaction.refId&&` · Mã GD: ${row.transaction.refId}`}</small></>:<span>Giao dịch không còn tồn tại</span>}</td>
        <td className="reclassify-amount">{row.transaction&&<><small>{row.transaction.direction==="CREDIT"?"Thu":"Chi"}</small><strong>{vnd(row.transaction.amount)}</strong></>}</td><td>{row.from}</td><td>{row.to}</td><td>{row.reason}<small className={`reclassify-row-status ${row.status.toLowerCase()}`}>{row.status==="APPLIED"?"Đã áp dụng":row.status==="CONFLICT"?"Bỏ qua: giao dịch vừa được sửa, giữ nguyên":"Chờ xác nhận áp dụng"}</small></td>
      </tr>)}</tbody></table></div><small>Hiển thị đầy đủ {run.changeDetails.length} thay đổi; các thay đổi đã áp dụng được ghi lịch sử.</small></div>}
      {run.status==="COMPLETE"&&<div className="notice">Đã hoàn tất lượt này. Các giao dịch đến sau lúc bắt đầu sẽ được kiểm tra ở lượt mới.</div>}
      {run.error&&<div className="notice danger" role="alert">{run.error}</div>}
    </>}
    {error&&<div className="notice danger" role="alert">{error}</div>}
    <div className="reclassify-buttons">
      {!active&&<button type="button" className="button primary" disabled={busy||loadingRun} onClick={()=>perform("NEW")}>{busy?"Đang khởi tạo…":run?"Kiểm tra lại tab":"Bắt đầu kiểm tra toàn bộ tab"}</button>}
      {run?.status==="CHECKING"&&<button type="button" className="button primary" disabled={busy||loadingRun} onClick={()=>perform("CHECK")}>{busy?"Đang kiểm tra…":"Tiếp tục kiểm tra"}</button>}
      {run&&["READY","APPLYING"].includes(run.status)&&<button type="button" className="button primary" disabled={busy||loadingRun} onClick={()=>perform("APPLY")}>{busy?"Đang áp dụng…":run.status==="READY"?`Xác nhận áp dụng ${run.changes} thay đổi`:`Tiếp tục áp dụng (${run.applied}/${run.changes})`}</button>}
      {run?.status==="READY"&&!busy&&<button type="button" className="button subtle" onClick={()=>perform("NEW")}>Bỏ kết quả và kiểm tra mới</button>}
      {busy&&<button type="button" className="button subtle" onClick={()=>{stop.current=true}}>Dừng sau lô hiện tại</button>}
    </div>
  </Modal>;
}
