"use client";
import { LoadingIndicator } from "@/components/loading-indicator";

import { TransferDetailsModal } from "@/components/admin/transfer-details";
import { RecordAuthor } from "@/components/admin/record-author";
import { AdminDialogButton } from "@/components/admin/dialog-workspace";
import { Plus, Undo2 } from "lucide-react";
import { useAdminResource } from "@/lib/admin-api";
import type { AdminTransfers } from "@/lib/admin-read-model";
import { Heading, Section, Empty } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import { reverseTransfer } from "@/lib/admin-api";
import { vnd } from "@/lib/domain";
export default function Transfers() {
  const {data,loading,error}=useAdminResource<AdminTransfers>("transfers");
  const transfers=data??[];
  return (
    <>
      <Heading
        eyebrow="SỔ ĐIỀU CHUYỂN NỘI BỘ"
        title="Điều chuyển"
        description="Cắt đúng số tiền từ các khoản hùn phước mới nhất; tự tách khoản cuối và giữ nguyên tổng tiền từng tài khoản."
      >
        <AdminDialogButton kind="transfer" className="button primary">
          <Plus size={16} />
          Tạo điều chuyển
        </AdminDialogButton>
      </Heading>
      <Section
        title="Lịch sử điều chuyển"
        note="100 bút toán gần nhất. Khoản đã ghi không bị xóa; hủy bằng bút toán đảo."
      >
        {error&&<div className="notice danger">{error}</div>}
        {loading&&!data?<LoadingIndicator label="Đang tải điều chuyển…"/>:!transfers.length ? (
          <Empty title="Chưa có điều chuyển">
            Chọn Tạo điều chuyển để phân bổ tiền giữa các thiện pháp.
          </Empty>
        ) : (
          <div className="table-scroll table-card workspace-table">
            <table>
              <thead>
                <tr>
                  <th>Tài khoản</th>
                  <th>Thiện pháp nguồn</th>
                  <th>Thiện pháp nhận</th>
                  <th>Lý do</th>
                  <th className="align-right">Số tiền</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                  <th>Người tạo</th>
                  <th>Người đảo</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                  <tr key={t.id}>
                    <td className="nowrap">{t.account?.number ?? (t.mode==="ALLOCATION"?"Nhiều tài khoản":t.fromFund.account.number)}</td>

                    <td>
                      <span className="code">{t.fromFund.code}</span>
                      <small>{t.fromFund.name}</small>
                    </td>
                    <td>
                      <span className="code">{t.toFund.code}</span>
                      <small>{t.toFund.name}</small>
                    </td>
                    <td className="transfer-reason">{t.reason}<small>{t.mode==="ALLOCATION"?"Điều chuyển các phần hùn phước":"Điều chuyển số dư cũ"}{t.targetIncome!==null?` · Mức thành tựu ${vnd(t.targetIncome)}`:""}</small></td>
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
                      {t._count.items>0&&<TransferDetailsModal id={t.id} count={t._count.items}/>}
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
                    <td><RecordAuthor name={t.actorName} id={t.actorId} fallback={t.actor} at={t.createdAt} /></td>
                    <td>{t.reversal ? <RecordAuthor name={t.reversal.actorName} id={t.reversal.actorId} fallback={t.reversal.actor} at={t.reversal.createdAt} /> : <span className="record-author-unknown">{t.reversalOf ? "Bút toán đảo" : "Chưa đảo"}</span>}</td>
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
