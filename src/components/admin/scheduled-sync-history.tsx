"use client";
import { LoadingIndicator } from "@/components/loading-indicator";

import type { AdminSync } from "@/lib/admin-read-model";
import { dateTime } from "@/lib/domain";
import { FULL_DAY_TIMES, PREVIOUS_DAY_TIMES } from "@/lib/sync-schedule";
import { Modal } from "@/components/modal";
const names: Record<string,string> = { RECEIVED:"Đã nhận", RUNNING:"Đang chạy", QUEUED:"Chờ chạy", SKIPPED:"Bỏ qua — đang có lượt chạy", PARTIAL:"Còn dữ liệu", SUCCESS:"Hoàn tất", FAILED:"Thất bại", SUPERSEDED:"Đã đổi cấu hình" };
const preciseTime = (at: Date) => new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(at);
export function ScheduledSyncHistory({full,data}:{full:boolean;data?:AdminSync}) {
  if(!data?.stats)return <LoadingIndicator label="Đang tải thống kê đồng bộ…"/>;
  const {requests,sweeps,stats:{requestsToday,requestsAll,quickToday,grouped,lastCall,sweepsToday,sweepsDone,sweepsAll,lastSweep}}=data;
  return <>
    <div className="sync-call-stats">
      <span>Webhook hôm nay <strong>{requestsToday}</strong> · tổng <b>{requestsAll}</b></span>
      <span>Lượt có lấy mới <strong>{quickToday}</strong></span>
      <span>Bỏ qua <b>{grouped.find(g=>g.status==="SKIPPED")?._count ?? 0}</b> · lỗi <b>{grouped.find(g=>g.status==="FAILED")?._count ?? 0}</b></span>
      <span>Gọi gần nhất <strong>{lastCall ? preciseTime(lastCall.receivedAt) : "Chưa có"}</strong></span>
      <span>Quét ngày hôm nay <strong>{sweepsToday}</strong> đợt bắt đầu · <b>{sweepsDone}</b> hoàn tất · tổng <b>{sweepsAll}</b></span>
      <span>Quét ngày gọi gần nhất <strong>{lastSweep?.lastCalledAt ? preciseTime(lastSweep.lastCalledAt) : "Chưa có"}</strong></span>
      <Modal title="Lịch đồng bộ tự động" trigger="Xem lịch" triggerClassName="button subtle small">
        <p><strong>Giờ Việt Nam (UTC+7).</strong> Cron bên ngoài gọi POST mỗi phút. Một lượt có thể lấy mới và tiếp tục quét toàn ngày.</p>
        <p>Quét ngày hiện tại: <strong>{FULL_DAY_TIMES.join(" · ")}</strong>.</p>
        <p>Quét ngày hôm trước: <strong>{PREVIOUS_DAY_TIMES.join(" · ")}</strong>.</p>
        <p>Mốc lịch là thời điểm đến hạn; bắt đầu thực tế ở lượt webhook kế tiếp có ngân sách. Đợt chưa xong tiếp tục qua nhiều lượt, không tính thành nhiều đợt mới. Nếu cron ngừng lâu, chỉ bù mốc gần nhất cho cùng ngày. Web không tự chạy lịch khi không có webhook gọi vào.</p>
      </Modal>
    </div>
    <div className="sync-log-caption">{full ? "100 đợt gần nhất · Trang 100 giao dịch, quét tới hết; số lượt là số webhook đã xử lý đợt đó." : "100 webhook hợp lệ gần nhất · Ghi cả lượt bỏ qua do khóa. Trang lấy mới: 20 giao dịch; trang quét ngày: 100."} Trạng thái cập nhật khi mở lại tab.</div>
    <div className="table-scroll table-card sync-log-scroll" tabIndex={0} role="region" aria-label={full ? "Các đợt quét toàn ngày" : "Lượt webhook từ bên ngoài"}>
      {full ? <table><thead><tr><th>Đến hạn</th><th>Ngày quét</th><th>Trạng thái</th><th>Bắt đầu thực tế</th><th>Gọi gần nhất</th><th>Hoàn tất</th><th>Lượt / trang</th><th>Mới / sửa</th><th>Chi tiết</th></tr></thead><tbody>
        {sweeps.map(s=><tr key={s.id}><td className="nowrap">{dateTime(s.scheduledAt)}</td><td>{s.targetDate}<small>{s.kind==="PREVIOUS_DAY"?"Ngày hôm trước":"Trong ngày"}</small></td><td>{names[s.status]??s.status}</td><td className="nowrap">{s.startedAt?dateTime(s.startedAt):"—"}</td><td className="nowrap">{s.lastCalledAt?preciseTime(s.lastCalledAt):"—"}</td><td className="nowrap">{s.finishedAt?dateTime(s.finishedAt):"—"}</td><td>{s.calls} / {s.pages}</td><td>{s.inserted} / {s.updated}</td><td><Modal title="Chi tiết đợt quét" description={`${s.targetDate} · ${dateTime(s.scheduledAt)}`} trigger="Chi tiết" triggerClassName="button subtle small"><pre className="audit-json">{JSON.stringify({id:s.id,slot:s.slotKey,progress:s.progress,error:s.error},null,2)}</pre></Modal></td></tr>)}
        {!sweeps.length&&<tr><td colSpan={9}>Chưa có đợt quét tự động. Lịch được kích hoạt khi webhook gọi vào.</td></tr>}
      </tbody></table> : <table><thead><tr><th>Nhận lúc</th><th>Trạng thái</th><th>Trang lấy mới</th><th>Trang quét ngày</th><th>Mới / sửa</th><th>Thời gian</th><th>Chi tiết</th></tr></thead><tbody>
        {requests.map(r=><tr key={r.id}><td className="nowrap" title={r.receivedAt.toISOString()}>{preciseTime(r.receivedAt)}</td><td>{names[r.status]??r.status}</td><td>{r.quickPages}</td><td>{r.fullPages}</td><td>{r.inserted} / {r.updated}</td><td>{r.finishedAt?`${((r.finishedAt.getTime()-r.receivedAt.getTime())/1000).toFixed(1)}s`:"Chưa kết thúc"}</td><td><Modal title="Chi tiết webhook" description={dateTime(r.receivedAt)} trigger="Chi tiết" triggerClassName="button subtle small"><pre className="audit-json">{JSON.stringify({id:r.id,status:r.status,jobs:r.jobIds,error:r.error},null,2)}</pre></Modal></td></tr>)}
        {!requests.length&&<tr><td colSpan={7}>Chưa nhận webhook hợp lệ từ bên ngoài. Dữ liệu thống kê bắt đầu từ bản cập nhật này.</td></tr>}
      </tbody></table>}
    </div>
  </>;
}
