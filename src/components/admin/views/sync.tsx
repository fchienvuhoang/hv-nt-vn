"use client";
import { RecordAuthor } from "@/components/admin/record-author";
import { ScheduledSyncHistory } from "@/components/admin/scheduled-sync-history";
import { Cable, RefreshCw, Settings2 } from "lucide-react";
import { useAdminResource } from "@/lib/admin-api";
import type { AdminBootstrap,AdminSync } from "@/lib/admin-read-model";
import { AdminLink as Link } from "@/components/admin/admin-link";
import { adminUrl, type AdminParams } from "@/lib/admin-navigation";
import { SyncRecency } from "@/components/admin/sync-recency";
import { Empty } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import { syncNow, configureSyncStart } from "@/lib/admin-api";
import { dateTime, localDate } from "@/lib/domain";
const actionNames: Record<string, string> = {
  FUND_CREATED: "Tạo thiện pháp",
  FUND_UPDATED: "Sửa thiện pháp",
  TRANSACTION_ASSIGNED: "Phân loại tay",
  TRANSACTIONS_REASSIGNED: "Gán nhiều giao dịch sang thiện pháp",
  TRANSACTION_NOTE_ADDED: "Thêm ghi chú công khai",
  TAB_RECLASSIFICATION_STARTED: "Bắt đầu kiểm tra tab giao dịch",
  TAB_RECLASSIFICATION_CHECKED: "Đã kiểm tra phân loại tab",
  TAB_RECLASSIFICATION_FINISHED: "Hoàn tất phân loại tab",
  TAB_RECLASSIFICATION_STALE: "Dừng phân loại vì cấu hình thay đổi",
  TRANSACTION_RECLASSIFICATION_RUN: "Chạy phân loại trang giao dịch",
  TRANSACTION_RECLASSIFIED: "Phân loại lại",
  OPENING_ACCOUNT_SAVED: "Lưu đầu kỳ tài khoản",
  OPENING_FUND_SAVED: "Lưu đầu kỳ thiện pháp",
  OPENING_CSV_IMPORTED: "Nhập CSV đầu kỳ",
  OPENING_FINALIZED: "Khóa sổ đầu kỳ",
  TRANSFER_CREATED: "Điều chuyển",
  TRANSFER_REVERSED: "Đảo điều chuyển",
  SOURCE_UPDATED: "Nguồn sửa giao dịch",
  SYNC_START_UPDATED: "Đổi ngày bắt đầu sao kê",
  FUND_EXCEL_STAGED: "Tải lên và đọc Excel",
  FUND_EXCEL_IMPORTED: "Nhập Excel vào thiện pháp",
  EXCEL_ALLOCATION_APPLIED: "Phân bổ từ file Excel",
  EXCEL_BANK_MATCHED: "Đối chiếu Excel và sao kê",
  DUPLICATE_REVIEWED: "Kiểm tra giao dịch nghi trùng",
  LEGACY_SUMMARY_REPLACED: "Thay tổng cũ bằng chi tiết Excel",
};
export default function Sync({params={},bootstrap}:{params?:AdminParams;bootstrap?:AdminBootstrap}) {
  const auditTab=params.log==="audit",scheduleTab=!auditTab&&params.log!=="runs";
  const {data,loading,error}=useAdminResource<AdminSync>(`sync?${new URLSearchParams({log:params.log??""})}`,5000);
  const runs=data?.runs??[],audits=data?.audits??[],states=bootstrap?.states??[],accounts=bootstrap?.accounts??[],recency=bootstrap?.recency??[];
  return (
    <div className="sync-workspace">
      <div className="sync-toolbar">
        <h1>Đồng bộ & lịch sử</h1>
        <SyncRecency initial={recency} initialNow={recency[0]?.checkedAt ?? 0} />
        <div className="sync-toolbar-actions">
        <Modal
          wide
          title="Ngày bắt đầu sao kê"
          description="Không cần chốt sổ. Có thể quét lại lịch sử; dữ liệu đã nhập được giữ và chống trùng."
          trigger={
            <>
              <Settings2 size={16} />
              Cấu hình sao kê
            </>
          }
        >
          {accounts.map((a) => (
            <section className="sync-account-setting" key={a.id}>
              <h3>
                {a.number} · {a.label}
              </h3>
              <ActionForm action={configureSyncStart} label="Lưu ngày bắt đầu">
                <input name="accountId" type="hidden" value={a.id} />
                <label>
                  Lấy giao dịch từ ngày
                  <input
                    name="from"
                    type="date"
                    defaultValue={
                      a.syncFrom ? localDate(a.syncFrom) : localDate()
                    }
                    max={localDate()}
                    required
                  />
                </label>
              </ActionForm>
            </section>
          ))}
        </Modal>
        <Modal
          title="Kết nối đồng bộ mỗi phút"
          trigger={
            <>
              <Cable size={16} />
              Kết nối đồng bộ
            </>
          }
          description="Cấu hình tại cron-job.org và biến môi trường của ứng dụng."
        >
          <p className="modal-help">Cron-job.org: timeout 30 giây. Trên Vercel đặt SYNC_BUDGET_MS=20000; mặc định mới đã là 20 giây. Lịch quét ngày nằm ở mục Xem lịch.</p>
          <dl className="connection-details">
            <dt>Phương thức</dt>
            <dd>POST</dd>
            <dt>Đường dẫn</dt>
            <dd>
              <code>/api/sync/transactions</code>
            </dd>
            <dt>Lịch gọi</dt>
            <dd>
              <code>* * * * *</code> · Mỗi phút
            </dd>
            <dt>Header xác thực</dt>
            <dd>
              <code>Authorization: Bearer &lt;SYNC_SECRET&gt;</code>
            </dd>
          </dl>
          <div className="notice">
            Dùng tên miền thật của ứng dụng trước đường dẫn. SYNC_SECRET được
            đặt trong môi trường triển khai; không đưa khóa vào URL. Lượt chưa
            lấy hết dữ liệu sẽ tiếp tục ở lần gọi sau.
          </div>
        </Modal>
        <Modal
          title="Đồng bộ sao kê ngay"
          trigger={
            <>
              <RefreshCw size={16} />
              Đồng bộ ngay
            </>
          }
          triggerClassName="button primary"
          description="Lấy giao dịch mới của hai tài khoản và tiếp tục lịch sử đang nhập."
        >
          <ActionForm action={syncNow} label="Bắt đầu đồng bộ" />
          <p className="modal-help">
            Giao dịch sẽ được lưu thật. Mặc định lấy từ hôm nay; đổi ngày tại
            Cấu hình sao kê nếu cần lấy lịch sử. Dữ liệu Excel được đối chiếu để
            tránh cộng hai lần.
          </p>
        </Modal>
        <Modal wide title="Tiến độ theo tài khoản" description="Mốc thành công chỉ cập nhật sau khi lấy đủ thu hoặc chi trong cửa sổ dữ liệu." trigger="Tiến độ" triggerClassName="button subtle small">
          {!states.length ? (
            <Empty title="Chưa khởi tạo đồng bộ">
              Chọn Đồng bộ ngay để bắt đầu. Có thể đổi ngày lấy lịch sử tại Cấu
              hình sao kê.
            </Empty>
          ) : (
            <div className="table-scroll table-card">
              <table>
                <thead>
                  <tr>
                    <th>Tài khoản</th>
                    <th>Thu / chi</th>
                    <th>Hoàn thành gần nhất</th>
                    <th>Cửa sổ đang xử lý</th>
                    <th>Trang tiếp theo</th>
                  </tr>
                </thead>
                <tbody>
                  {states.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <span className="account-number">
                          {s.account.number}
                        </span>
                      </td>
                      <td>{s.direction === "CREDIT" ? "Thu" : "Chi"}</td>
                      <td>
                        {s.lastSuccessAt
                          ? dateTime(s.lastSuccessAt)
                          : "Chưa hoàn tất"}
                      </td>
                      <td>
                        {s.windowFrom
                          ? `${s.windowFrom} → ${s.windowTo}`
                          : "Đã xong"}
                      </td>
                      <td>{s.windowFrom ? s.nextPage : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
        </div>
      </div>
      <nav className="sync-log-tabs fund-status-tabs" aria-label="Loại nhật ký">
        <Link href={adminUrl("sync")} scroll={false} className={scheduleTab && params.log !== "full" ? "selected" : ""} aria-current={scheduleTab && params.log !== "full" ? "page" : undefined}>Webhook mỗi phút</Link>
        <Link href={adminUrl("sync", { log: "full" })} scroll={false} className={params.log === "full" ? "selected" : ""} aria-current={params.log === "full" ? "page" : undefined}>Quét toàn ngày</Link>
        <Link href={adminUrl("sync", { log: "runs" })} scroll={false} className={params.log === "runs" ? "selected" : ""} aria-current={params.log === "runs" ? "page" : undefined}>Đồng bộ thủ công</Link>
        <Link href={adminUrl("sync", { log: "audit" })} scroll={false} className={auditTab ? "selected" : ""} aria-current={auditTab ? "page" : undefined}>Lịch sử thao tác</Link>
      </nav>
      <section className="sync-log-panel" aria-label={scheduleTab ? (params.log === "full" ? "Quét toàn ngày" : "Webhook mỗi phút") : auditTab ? "Lịch sử thao tác" : "Đồng bộ thủ công"}>
      {error&&<div className="notice danger" role="alert">{error}</div>}
      {loading&&!data?<p role="status">Đang tải nhật ký…</p>:scheduleTab ? <ScheduledSyncHistory full={params.log === "full"} data={data} /> : !auditTab ? (
        <>
          {!runs.length ? (
            <Empty />
          ) : (
            <div className="table-scroll table-card sync-log-scroll" tabIndex={0} role="region" aria-label="Bảng nhật ký đồng bộ">
              <table>
                <thead>
                  <tr>
                    <th>Bắt đầu</th>
                    <th>Trạng thái</th>
                    <th className="align-right">Trang</th>
                    <th className="align-right">Mới</th>
                    <th className="align-right">Sửa</th>
                    <th>Người chạy / lỗi</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td className="nowrap">{dateTime(r.startedAt)}</td>
                      <td>
                        <span
                          className={`badge ${r.status === "SUCCESS" ? "active" : r.status === "FAILED" ? "error" : "pending"}`}
                        >
                          {{ SUCCESS: "Hoàn tất", FAILED: "Thất bại", PARTIAL: "Chưa hoàn tất", RUNNING: "Đang chạy" }[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="money align-right">{r.pages}</td>
                      <td className="money align-right">{r.inserted}</td>
                      <td className="money align-right">{r.updated}</td>
                      <td>
                        <RecordAuthor name={r.actorName} id={r.actorId} fallback={r.actor} at={r.startedAt} />
                        {r.error && (
                          <Modal title="Lỗi đồng bộ" description={dateTime(r.startedAt)} trigger="Xem lỗi" triggerClassName="button subtle small"><p className="sync-error-detail">{r.error}</p></Modal>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          {!audits.length ? (
            <Empty />
          ) : (
            <div className="table-scroll table-card sync-log-scroll" tabIndex={0} role="region" aria-label="Bảng lịch sử thao tác">
              <table>
                <thead><tr><th>Thời gian</th><th>Thao tác</th><th>Mã bản ghi</th><th>Chi tiết</th><th>Người thực hiện</th></tr></thead>
                <tbody>
              {audits.map((a) => (
                <tr key={a.id}>
                  <td className="nowrap">{dateTime(a.createdAt)}</td>
                  <td><strong>{actionNames[a.action] ?? a.action}</strong></td>
                  <td><span className="sync-log-clip" title={a.entityId}>{a.entityId}</span></td>
                  <td>
                  <Modal
                    title={actionNames[a.action] ?? a.action}
                    description={`${dateTime(a.createdAt)} · ${a.actorName || a.actor} · ID: ${a.actorId ?? "Dữ liệu cũ"}`}
                    trigger="Chi tiết"
                    triggerClassName="button subtle small"
                  >
                    <pre className="audit-json">
                      {JSON.stringify(a.details, null, 2)}
                    </pre>
                    <small>Mã bản ghi: {a.entityId}</small>
                  </Modal>
                  </td>
                  <td><span className="sync-log-clip" title={`${a.actor} · ID: ${a.actorId ?? "Dữ liệu cũ"}`}>{a.actorName || a.actor}</span></td>
                </tr>
              ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      </section>
    </div>
  );
}
