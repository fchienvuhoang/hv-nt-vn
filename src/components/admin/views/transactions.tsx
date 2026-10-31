import { requireAdmin } from "@/lib/auth";
import { EntryReview } from "@/components/admin/entry-review";
import { Modal } from "@/components/modal";
import { db } from "@/lib/db";
import {
  Empty,
  Pagination,
  pageNumber,
} from "@/components/ui";
import { dateTime, vnd, fundUsesAccount } from "@/lib/domain";
import { ActionForm } from "@/components/action-form";
import { assignTransaction, reclassifyPending } from "@/app/admin/actions";
import type { Prisma } from "@/generated/prisma/client";
export default async function Transactions({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pending?: string;
    account?: string;
    q?: string;
    type?: string;
    fund?: string;
    review?: string;
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const page = pageNumber(params.page);
  const pageSize = 100;
  const query = (params.q ?? "").slice(0, 100);
  const direction =
    params.type === "CREDIT" || params.type === "DEBIT"
      ? params.type
      : undefined;
  const where: Prisma.BankTransactionWhereInput = {
    entryStatus:
      params.review === "1"
        ? "REVIEW"
        : params.review === "merged"
          ? "MERGED"
          : { not: "MERGED" },
    ...(params.pending === "1"
      ? { fundId: null }
      : params.fund
        ? { fundId: params.fund }
        : {}),
    ...(params.account ? { accountId: params.account } : {}),
    ...(direction ? { direction } : {}),
    ...(query
      ? {
          OR: [
            { narrative: { contains: query, mode: "insensitive" } },
            { refId: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, count, accounts, funds] = await Promise.all([
    db.bankTransaction.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { fund: true, account: true },
    }),
    db.bankTransaction.count({ where }),
    db.bankAccount.findMany(),
    db.fund.findMany({ orderBy: { code: "asc" } }),
  ]);
  const baseParams = new URLSearchParams({
    view: "transactions",
    ...(params.review ? { review: params.review } : {}),
    ...(params.pending ? { pending: params.pending } : {}),
    ...(params.account ? { account: params.account } : {}),
    ...(query ? { q: query } : {}),
    ...(direction ? { type: direction } : {}),
    ...(params.fund ? { fund: params.fund } : {}),
  });
  return (
    <div className="transaction-sheet">
      <div className="sheet-toolbar">
        <h1>Giao dịch <span>{count.toLocaleString("vi-VN")}</span></h1>
        <p title="Các dòng đã gộp chỉ để tra cứu, không tính thêm lần nữa.">Khoản nghi trùng chưa cộng tổng.</p>
        <ActionForm action={reclassifyPending} label="Phân loại lại" className="compact" />
      </div>
      <section className="sheet-panel" aria-label="Danh sách giao dịch">
        <form className="filter-bar" action="/admin" method="get">
          <input type="hidden" name="view" value="transactions" />
          {params.fund && <input type="hidden" name="fund" value={params.fund} />}
          <label>
            Tìm kiếm
            <input
              name="q"
              placeholder="Nội dung hoặc mã giao dịch"
              defaultValue={query}
            />
          </label>
          <label>
            Tài khoản
            <select name="account" defaultValue={params.account ?? ""}>
              <option value="">Tất cả tài khoản</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.number} · {a.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Thu / chi
            <select name="type" defaultValue={direction ?? ""}>
              <option value="">Tất cả</option>
              <option value="CREDIT">Thu</option>
              <option value="DEBIT">Chi</option>
            </select>
          </label>
          <label>
            Phân loại
            <select name="pending" defaultValue={params.pending ?? ""}>
              <option value="">Tất cả</option>
              <option value="1">Chưa phân loại</option>
            </select>
          </label>
          <label>
            Đối chiếu
            <select name="review" defaultValue={params.review ?? ""}>
              <option value="">Đang ghi nhận</option>
              <option value="1">Nghi trùng — chưa cộng tổng</option>
              <option value="merged">Đã gộp / đối chiếu</option>
            </select>
          </label>
          <button className="button primary">Lọc</button>
        </form>
        {!rows.length ? (
          <Empty title="Không có giao dịch phù hợp" />
        ) : (
          <div className="table-scroll sheet-scroll" tabIndex={0} role="region" aria-label="Bảng giao dịch, cuộn để xem thêm">
            <table className="sheet-table">
              <colgroup><col className="sheet-col-index" /><col className="sheet-col-time" /><col className="sheet-col-account" /><col className="sheet-col-ref" /><col /><col className="sheet-col-money" /><col className="sheet-col-fund" /><col className="sheet-col-action" /></colgroup>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Thời gian</th>
                  <th scope="col">TK</th>
                  <th scope="col">Mã giao dịch</th>
                  <th scope="col">Nội dung gốc / người chuyển</th>
                  <th className="align-right">Số tiền</th>
                  <th scope="col">Thiện pháp</th>
                  <th scope="col">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, index) => (
                  <tr key={r.id} className={r.entryStatus === "REVIEW" ? "sheet-review" : undefined}>
                    <td className="sheet-index">{(page - 1) * pageSize + index + 1}</td>
                    <td className="nowrap">
                      {dateTime(r.occurredAt)}
                    </td>
                    <td className="nowrap" title={r.account.owner}>{r.account.number}</td>
                    <td><span className="sheet-clip sheet-ref" title={r.refId}>{r.refId || "—"}</span></td>
                    <td>
                      <span className="sheet-clip" title={`${r.narrative || "Không có nội dung"}\n${r.displayName} · ${r.origin === "EXCEL" ? "Nhập Excel" : "Sao kê ngân hàng"}`}>
                        {r.narrative || "Không có nội dung"}
                        {r.displayName && <span className="sheet-sender"> · {r.displayName}</span>}
                      </span>
                    </td>
                    <td
                      className={`align-right money nowrap ${r.direction === "CREDIT" ? "positive" : ""}`}
                    >
                      {r.direction === "CREDIT" ? "+" : "−"}
                      {vnd(r.amount)}
                    </td>
                    <td className="classification-cell">
                      <span
                        className={`badge ${r.fund ? "active" : "pending"}`}
                      >
                        {r.fund?.code ?? "Chờ phân loại"}
                      </span>
                      <span className="sheet-assignment" title={`${r.assignment === "MANUAL" ? "Gán tay" : r.assignment === "AUTO" ? "Tự động" : "Chưa gán"} · ${r.matchReason}`}>
                        {r.assignment === "MANUAL" ? "Tay" : r.assignment === "AUTO" ? "Tự động" : ""}
                      </span>
                    </td>
                    <td className="sheet-row-actions">
                      {r.entryStatus === "REVIEW" ? (
                        <EntryReview entry={r} funds={funds} />
                      ) : r.entryStatus === "MERGED" ? (
                        <span className="badge neutral">
                          Đã đối chiếu — không tính lặp
                        </span>
                      ) : (
                        <Modal
                          title={
                            r.fund
                              ? "Đổi thiện pháp cho giao dịch"
                              : "Phân loại giao dịch bằng tay"
                          }
                          description="Chỉ chọn thiện pháp thuộc cùng tài khoản sao kê."
                          trigger={r.fund ? "Đổi thiện pháp" : "Gán bằng tay"}
                          triggerClassName="button subtle small"
                        >
                          <div className="modal-context">
                            <strong>{vnd(r.amount)}</strong>
                            <small>
                              {dateTime(r.occurredAt)} · Tài khoản{" "}
                              {r.account.number}
                            </small>
                            <p>{r.narrative}</p>
                          </div>
                          <ActionForm
                            action={assignTransaction}
                            label="Xác nhận gán"
                          >
                            <input
                              type="hidden"
                              name="transactionId"
                              value={r.id}
                            />
                            <label>
                              Thiện pháp
                              <select
                                name="fundId"
                                defaultValue={r.fundId ?? ""}
                                required
                              >
                                <option value="" disabled>
                                  Chọn thiện pháp
                                </option>
                                {funds
                                  .filter((f) => fundUsesAccount(f,r.accountId))
                                  .map((f) => (
                                    <option key={f.id} value={f.id}>
                                      {f.code} · {f.name}
                                      {f.status === "ACTIVE"
                                        ? ""
                                        : f.status === "PAUSED"
                                          ? " (Tạm dừng)"
                                          : " (Hoàn thành)"}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <label>
                              Lý do
                              <input
                                name="reason"
                                required
                                minLength={5}
                                maxLength={1000}
                                placeholder="Lý do phân loại / điều chỉnh"
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
        <Pagination page={page} total={count} pageSize={pageSize} base={`/admin?${baseParams}`} />
      </section>
    </div>
  );
}
