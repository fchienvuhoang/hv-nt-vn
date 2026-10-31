import Link from "next/link";
import { Plus, Undo2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Heading, Section, Empty } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import { reverseTransfer } from "@/app/admin/actions";
import { dateTime, vnd } from "@/lib/domain";
export default async function Transfers() {
  await requireAdmin();
  const transfers = await db.transfer.findMany({
    include: {
      fromFund: { include: { account: true } },
      toFund: true,
      reversal: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <>
      <Heading
        eyebrow="SỔ ĐIỀU CHUYỂN NỘI BỘ"
        title="Điều chuyển"
        description="Phân bổ giữa các thiện pháp cùng tài khoản. Tổng hùn phước và tổng chi không thay đổi."
      >
        <Link
          scroll={false}
          href="/admin?view=transfers&modal=transfer"
          className="button primary"
        >
          <Plus size={16} />
          Tạo điều chuyển
        </Link>
      </Heading>
      <Section
        title="Lịch sử điều chuyển"
        note="100 bút toán gần nhất. Khoản đã ghi không bị xóa; hủy bằng bút toán đảo."
      >
        {!transfers.length ? (
          <Empty title="Chưa có điều chuyển">
            Chọn Tạo điều chuyển để phân bổ tiền giữa các thiện pháp.
          </Empty>
        ) : (
          <div className="table-scroll workspace-table">
            <table>
              <thead>
                <tr>
                  <th>Thời gian / người thực hiện</th>
                  <th>Thiện pháp nguồn</th>
                  <th>Thiện pháp nhận</th>
                  <th>Lý do</th>
                  <th className="align-right">Số tiền</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                  <tr key={t.id}>
                    <td className="nowrap">
                      {dateTime(t.createdAt)}
                      <small>
                        {t.actor} · TK {t.fromFund.account.number}
                      </small>
                    </td>
                    <td>
                      <span className="code">{t.fromFund.code}</span>
                      <small>{t.fromFund.name}</small>
                    </td>
                    <td>
                      <span className="code">{t.toFund.code}</span>
                      <small>{t.toFund.name}</small>
                    </td>
                    <td className="transfer-reason">{t.reason}</td>
                    <td className="money align-right nowrap">
                      {vnd(t.amount)}
                    </td>
                    <td>
                      {t.reversalOf ? (
                        <span className="badge pending">Bút toán đảo</span>
                      ) : t.reversal ? (
                        <span className="badge neutral">Đã đảo</span>
                      ) : (
                        <span className="badge active">Đã ghi nhận</span>
                      )}
                    </td>
                    <td>
                      {!t.reversal && !t.reversalOf && (
                        <Modal
                          title="Đảo khoản điều chuyển"
                          description="Tạo bút toán ngược chiều; giữ nguyên lịch sử gốc."
                          trigger={
                            <>
                              <Undo2 size={14} />
                              Đảo khoản
                            </>
                          }
                          triggerClassName="button subtle small"
                        >
                          <div className="modal-context">
                            <strong>
                              {t.fromFund.code} → {t.toFund.code} ·{" "}
                              {vnd(t.amount)}
                            </strong>
                            <p>{t.reason}</p>
                          </div>
                          <ActionForm
                            action={reverseTransfer}
                            label="Xác nhận đảo điều chuyển"
                            confirm="Đảo toàn bộ khoản điều chuyển này?"
                          >
                            <input
                              type="hidden"
                              name="transferId"
                              value={t.id}
                            />
                            <label>
                              Lý do đảo
                              <input
                                name="reason"
                                required
                                minLength={5}
                                maxLength={1000}
                              />
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
    </>
  );
}
