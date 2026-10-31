import { Cable, RefreshCw, Settings2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Heading, Section, Empty } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import { syncNow, configureSyncStart } from "@/app/admin/actions";
import { dateTime, localDate } from "@/lib/domain";
const actionNames: Record<string, string> = {
  FUND_CREATED: "Tạo thiện pháp",
  FUND_UPDATED: "Sửa thiện pháp",
  TRANSACTION_ASSIGNED: "Phân loại tay",
  TRANSACTION_RECLASSIFIED: "Phân loại lại",
  OPENING_ACCOUNT_SAVED: "Lưu đầu kỳ tài khoản",
  OPENING_FUND_SAVED: "Lưu đầu kỳ thiện pháp",
  OPENING_CSV_IMPORTED: "Nhập CSV đầu kỳ",
  OPENING_FINALIZED: "Khóa sổ đầu kỳ",
  TRANSFER_CREATED: "Điều chuyển",
  TRANSFER_REVERSED: "Đảo điều chuyển",
  SOURCE_UPDATED: "Nguồn sửa giao dịch",
  SYNC_START_UPDATED: "Đổi ngày bắt đầu sao kê",
  FUND_EXCEL_IMPORTED: "Nhập Excel vào thiện pháp",
  EXCEL_ALLOCATION_APPLIED: "Phân bổ từ file Excel",
  EXCEL_BANK_MATCHED: "Đối chiếu Excel và sao kê",
  DUPLICATE_REVIEWED: "Kiểm tra giao dịch nghi trùng",
  LEGACY_SUMMARY_REPLACED: "Thay tổng cũ bằng chi tiết Excel",
};
export default async function Sync() {
  await requireAdmin();
  const [runs, states, audits, accounts] = await Promise.all([
    db.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 30 }),
    db.syncState.findMany({
      include: { account: true },
      orderBy: [{ accountId: "asc" }, { direction: "asc" }],
    }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    db.bankAccount.findMany({
      select: {
        id: true,
        number: true,
        label: true,
        syncFrom: true,
      },
      orderBy: { number: "asc" },
    }),
  ]);
  return (
    <>
      <Heading
        eyebrow="VẬN HÀNH & TRUY VẾT"
        title="Đồng bộ & lịch sử"
        description="Theo dõi tiến độ lấy sao kê và lịch sử thao tác của ban quản trị."
      >
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
          title="Kết nối đồng bộ mỗi 20 phút"
          trigger={
            <>
              <Cable size={16} />
              Kết nối đồng bộ
            </>
          }
          description="Cấu hình tại cron-job.org và biến môi trường của ứng dụng."
        >
          <dl className="connection-details">
            <dt>Phương thức</dt>
            <dd>POST</dd>
            <dt>Đường dẫn</dt>
            <dd>
              <code>/api/sync/transactions</code>
            </dd>
            <dt>Lịch gọi</dt>
            <dd>
              <code>*/20 * * * *</code> · Mỗi 20 phút
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
      </Heading>
      <div className="sync-grid">
        <Section
          title="Tiến độ theo tài khoản"
          note="Mốc thành công chỉ tiến lên khi đã lấy đủ các trang của cửa sổ dữ liệu."
        >
          {!states.length ? (
            <Empty title="Chưa khởi tạo đồng bộ">
              Chọn Đồng bộ ngay để bắt đầu. Có thể đổi ngày lấy lịch sử tại Cấu
              hình sao kê.
            </Empty>
          ) : (
            <div className="table-scroll">
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
        </Section>
        <Section
          title="Nhật ký đồng bộ"
          note="30 lượt gần nhất. PARTIAL: đã lưu một phần, sẽ tiếp tục."
        >
          {!runs.length ? (
            <Empty />
          ) : (
            <div className="table-scroll log-table">
              <table>
                <thead>
                  <tr>
                    <th>Bắt đầu</th>
                    <th>Trạng thái</th>
                    <th>Trang / mới / sửa</th>
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
                          {r.status}
                        </span>
                      </td>
                      <td>
                        {r.pages} / {r.inserted} / {r.updated}
                      </td>
                      <td>
                        {r.actor}
                        {r.error && (
                          <small className="warning-text">{r.error}</small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
        <Section
          title="Lịch sử thao tác"
          note="100 thao tác gần nhất. Mở chi tiết để kiểm tra thay đổi."
        >
          {!audits.length ? (
            <Empty />
          ) : (
            <div className="audit-list log-table">
              {audits.map((a) => (
                <div className="audit-entry" key={a.id}>
                  <div>
                    <strong>{actionNames[a.action] ?? a.action}</strong>
                    <small>
                      {dateTime(a.createdAt)} · {a.actor}
                    </small>
                  </div>
                  <Modal
                    title={actionNames[a.action] ?? a.action}
                    description={`${dateTime(a.createdAt)} · ${a.actor}`}
                    trigger="Chi tiết"
                    triggerClassName="button subtle small"
                  >
                    <pre className="audit-json">
                      {JSON.stringify(a.details, null, 2)}
                    </pre>
                    <small>Mã bản ghi: {a.entityId}</small>
                  </Modal>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </>
  );
}
