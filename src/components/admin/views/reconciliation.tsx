import Link from "next/link";
import { BookOpen, FileUp, LockKeyhole, Settings2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { accountTotals } from "@/lib/ledger";
import { openingBalance, vnd, localDate, dateTime } from "@/lib/domain";
import { Heading, Section, Empty } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import {
  saveOpeningAccount,
  saveOpeningFund,
  importOpeningCsv,
  finalizeOpening,
} from "@/app/admin/actions";
export default async function Reconciliation() {
  await requireAdmin();
  const [accounts, funds] = await Promise.all([
    accountTotals(),
    db.fund.findMany({ orderBy: { code: "asc" } }),
  ]);
  return (
    <>
      <Heading
        eyebrow="CHUYỂN ĐỔI TỪ GOOGLE SHEETS"
        title="Đối soát đầu kỳ"
        description="Đối chiếu cùng thời điểm, xác nhận số dư rồi bắt đầu đồng bộ."
      >
        <Modal
          title="Chuyển đổi từ Google Sheets"
          trigger={
            <>
              <BookOpen size={16} />
              Hướng dẫn chuyển đổi
            </>
          }
        >
          <ol className="migration-steps">
            <li>
              <strong>Chọn ngày bắt đầu.</strong> Chốt Sheets và số dư ngân hàng
              ngay trước 00:00 ngày này, theo giờ Việt Nam.
            </li>
            <li>
              <strong>Nhập thiện pháp và tổng lịch sử.</strong> Dùng CSV hoặc
              tạo thiện pháp và nhập số tổng hợp bằng tay.
            </li>
            <li>
              <strong>Đối chiếu số dư.</strong> Ngân hàng = số dư thiện pháp +
              chưa phân bổ + chênh lệch có lý do.
            </li>
            <li>
              <strong>Khóa sổ.</strong> Sau xác nhận, các số đầu kỳ được khóa.
              Hệ thống chỉ đồng bộ giao dịch từ ngày bắt đầu.
            </li>
          </ol>
          <div className="notice">
            CSV chứa số tổng hợp, không phải danh sách giao dịch. Không nhập lại
            khoản trước ngày chốt vào luồng giao dịch mới.
          </div>
          <a
            href="/templates/so-du-dau-ky.csv"
            className="button primary"
            download
          >
            Tải mẫu CSV đầu kỳ
          </a>
        </Modal>
      </Heading>
      <div className="reconciliation-grid">
        {accounts.map((a) => {
          const accountFunds = funds.filter((f) => f.accountId === a.id);
          const sum = accountFunds.reduce((n, f) => n + openingBalance(f), 0n);
          const difference = a.openingBankBalance - sum - a.openingUnallocated;
          return (
            <Section
              key={a.id}
              title={`${a.number} · ${a.label}`}
              note={a.owner}
              action={
                <span
                  className={`badge ${a.finalizedAt ? "active" : "pending"}`}
                >
                  {a.finalizedAt ? "Đã khóa sổ" : "Đang thiết lập"}
                </span>
              }
            >
              <div className="reconcile-stats">
                <div>
                  <small>
                    {a.finalizedAt
                      ? "Ngân hàng tính từ sao kê"
                      : "Ngân hàng tại mốc chốt"}
                  </small>
                  <strong>
                    {vnd(a.finalizedAt ? a.expected : a.openingBankBalance)}
                  </strong>
                </div>
                <div>
                  <small>
                    {a.finalizedAt
                      ? "Số dư thiện pháp hiện tại"
                      : "Số dư thiện pháp đầu kỳ"}
                  </small>
                  <strong>{vnd(a.finalizedAt ? a.fundBalance : sum)}</strong>
                </div>
                <div>
                  <small>
                    {a.finalizedAt
                      ? "Chưa phân bổ hiện tại"
                      : "Chưa phân bổ đầu kỳ"}
                  </small>
                  <strong>
                    {vnd(a.finalizedAt ? a.unallocated : a.openingUnallocated)}
                  </strong>
                </div>
                <div>
                  <small>Chênh lệch đầu kỳ</small>
                  <strong
                    className={difference === 0n ? "positive" : "warning-text"}
                  >
                    {vnd(difference)}
                  </strong>
                </div>
              </div>
              {a.finalizedAt ? (
                <div className="notice success">
                  Đã khóa {dateTime(a.finalizedAt)} · Nhận giao dịch từ{" "}
                  {dateTime(a.cutoverAt!)}.
                  {a.openingDifference !== 0n && (
                    <p>Lý do chênh lệch: {a.differenceReason}</p>
                  )}
                  <p>
                    Sai lệch kiểm tra hệ thống:{" "}
                    <strong>{vnd(a.unexplained)}</strong>. Vẫn cần đối chiếu với
                    ngân hàng thực tế.
                  </p>
                </div>
              ) : (
                <div className="reconcile-actions">
                  <Modal
                    title={`Nhập CSV đầu kỳ · ${a.number}`}
                    description="Nhập các thiện pháp và số tổng hợp từ sổ cũ."
                    trigger={
                      <>
                        <FileUp size={14} />
                        Nhập CSV
                      </>
                    }
                    triggerClassName="button subtle small"
                  >
                    <ActionForm
                      action={importOpeningCsv}
                      label="Nhập CSV vào bản nháp"
                    >
                      <input type="hidden" name="accountId" value={a.id} />
                      <label>
                        File CSV theo mẫu
                        <input
                          name="file"
                          type="file"
                          accept=".csv,text/csv"
                          required
                        />
                      </label>
                      <div className="notice">
                        Cùng mã sẽ cập nhật số tổng hợp, không cộng dồn. Các
                        thiện pháp khác được giữ nguyên.
                      </div>
                      <a
                        href="/templates/so-du-dau-ky.csv"
                        className="text-link"
                        download
                      >
                        Tải mẫu CSV đầu kỳ ↓
                      </a>
                    </ActionForm>
                  </Modal>
                  <Modal
                    title={`Cấu hình đầu kỳ · ${a.number}`}
                    description="Lưu bản nháp trước khi đối chiếu và khóa sổ."
                    trigger={
                      <>
                        <Settings2 size={14} />
                        Số dư tài khoản
                      </>
                    }
                    triggerClassName="button subtle small"
                  >
                    <ActionForm
                      action={saveOpeningAccount}
                      label="Lưu bản nháp tài khoản"
                    >
                      <input type="hidden" name="accountId" value={a.id} />
                      <label>
                        Ngày bắt đầu nhận giao dịch mới
                        <input
                          type="date"
                          name="cutover"
                          required
                          max={localDate()}
                          defaultValue={
                            a.cutoverAt ? localDate(a.cutoverAt) : undefined
                          }
                        />
                        <small>
                          Số dư ngân hàng là số dư ngay trước 00:00 ngày này
                          (giờ Việt Nam).
                        </small>
                      </label>
                      <div className="form-row">
                        <label>
                          Số dư ngân hàng (VND)
                          <input
                            name="openingBankBalance"
                            required
                            inputMode="numeric"
                            pattern="[0-9]{1,15}"
                            defaultValue={a.openingBankBalance.toString()}
                          />
                        </label>
                        <label>
                          Tiền chưa phân bổ (VND)
                          <input
                            name="openingUnallocated"
                            required
                            inputMode="numeric"
                            pattern="-?[0-9]{1,15}"
                            defaultValue={a.openingUnallocated.toString()}
                          />
                        </label>
                      </div>
                      <label>
                        Giải thích chênh lệch nếu có
                        <textarea
                          name="differenceReason"
                          rows={3}
                          maxLength={1000}
                          defaultValue={a.differenceReason}
                        />
                      </label>
                    </ActionForm>
                  </Modal>
                  <Modal
                    title={`Xác nhận khóa sổ · ${a.number}`}
                    description="Số liệu đầu kỳ sẽ không thể chỉnh sửa sau bước này."
                    trigger={
                      <>
                        <LockKeyhole size={14} />
                        Khóa sổ
                      </>
                    }
                    triggerClassName="button primary small"
                  >
                    <div className="modal-context">
                      <small>Chênh lệch đầu kỳ</small>
                      <strong>{vnd(difference)}</strong>
                      <p>
                        {difference === 0n
                          ? "Số dư đầu kỳ đang khớp."
                          : "Chênh lệch được giữ riêng. Cần lưu lý do tại Số dư tài khoản trước khi xác nhận."}
                      </p>
                    </div>
                    <ActionForm
                      action={finalizeOpening}
                      label="Xác nhận & khóa sổ đầu kỳ"
                      confirm="Số liệu đầu kỳ sẽ được khóa. Bạn đã đối chiếu với ngân hàng và các Sheets?"
                    >
                      <input type="hidden" name="accountId" value={a.id} />
                      <label className="checkbox-label">
                        <input
                          name="confirmed"
                          type="checkbox"
                          value="yes"
                          required
                        />
                        Tôi đã kiểm tra cùng thời điểm với ngân hàng và Sheets,
                        hiểu rằng số liệu đầu kỳ sẽ được khóa.
                      </label>
                    </ActionForm>
                  </Modal>
                </div>
              )}
              {!accountFunds.length ? (
                <Empty title="Chưa có số dư thiện pháp">
                  <Link
                    href="/admin?view=reconciliation&modal=create-fund"
                    scroll={false}
                    className="text-link"
                  >
                    Tạo thiện pháp hoặc nhập CSV để bắt đầu →
                  </Link>
                </Empty>
              ) : (
                <div className="table-scroll opening-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Thiện pháp</th>
                        <th className="align-right">Số dư đầu kỳ</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {accountFunds.map((f) => (
                        <tr key={f.id}>
                          <td>
                            <span className="code">{f.code}</span>
                            <h3 className="table-fund-name">{f.name}</h3>
                          </td>
                          <td className="money align-right nowrap">
                            {vnd(openingBalance(f))}
                          </td>
                          <td>
                            {!a.finalizedAt && (
                              <Modal
                                title={`Số liệu lịch sử · ${f.code}`}
                                description={f.name}
                                trigger="Cấu hình"
                                triggerClassName="button subtle small"
                              >
                                <ActionForm
                                  action={saveOpeningFund}
                                  label="Lưu số tổng hợp"
                                >
                                  <input
                                    type="hidden"
                                    name="fundId"
                                    value={f.id}
                                  />
                                  <label>
                                    Tổng hùn phước lịch sử (VND)
                                    <input
                                      name="openingIncome"
                                      required
                                      pattern="[0-9]{1,15}"
                                      defaultValue={f.openingIncome.toString()}
                                    />
                                  </label>
                                  <label>
                                    Tổng chi thực tế lịch sử (VND)
                                    <input
                                      name="openingExpense"
                                      required
                                      pattern="[0-9]{1,15}"
                                      defaultValue={f.openingExpense.toString()}
                                    />
                                  </label>
                                  <label>
                                    Điều chuyển ròng lịch sử (VND)
                                    <input
                                      name="openingTransferNet"
                                      required
                                      pattern="-?[0-9]{1,15}"
                                      defaultValue={f.openingTransferNet.toString()}
                                    />
                                    <small>
                                      Điều chuyển nhận trừ chuyển đi; có thể âm.
                                    </small>
                                  </label>
                                </ActionForm>
                              </Modal>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          );
        })}
      </div>
    </>
  );
}
