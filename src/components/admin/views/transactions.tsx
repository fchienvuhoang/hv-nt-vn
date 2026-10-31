"use client";
import { useAdminResource } from "@/lib/admin-api";
import type { AdminTransactions,AdminBootstrap } from "@/lib/admin-read-model";
import { TransactionNoteEditor } from "@/components/admin/transaction-note-editor";
import { TabReclassification } from "@/components/admin/tab-reclassification";
import type { ReclassificationScope } from "@/lib/reclassify";
import { TransactionTabs } from "@/components/admin/transaction-tabs";
import { transactionDates } from "@/lib/transaction-scope";
import { SyncRecency } from "@/components/admin/sync-recency";
import { EntryReview } from "@/components/admin/entry-review";
import { Modal } from "@/components/modal";
import {
  Empty,
  Pagination,
  pageNumber,
} from "@/components/ui";
import { dateTime, localDate, vnd, fundUsesAccount } from "@/lib/domain";
import { ActionForm } from "@/components/action-form";
import { assignTransaction } from "@/lib/admin-api";
type TransactionParams={page?:string;pending?:string;account?:string;q?:string;type?:string;fund?:string;review?:string;from?:string;to?:string};
export default function Transactions({params,bootstrap}:{params:TransactionParams;bootstrap?:AdminBootstrap}) {
  const range=transactionDates(params.from,params.to),page=pageNumber(params.page),pageSize=100,query=(params.q??"").slice(0,100);
  const direction=params.type==="CREDIT"||params.type==="DEBIT"?params.type:undefined;
  const apiParams=new URLSearchParams(Object.entries({...params,from:range.from,to:range.to}).filter(([,v])=>v!==undefined&&v!=="") as [string,string][]);
  apiParams.delete("view");apiParams.delete("modal");apiParams.delete("fundId");apiParams.sort();
  const {data,loading,error}=useAdminResource<AdminTransactions>(`transactions?${apiParams}`);
  const rows=data?.rows??[],accounts=data?.accounts??bootstrap?.recency??[],funds=data?.funds??bootstrap?.funds??[];
  const historyCounts=new Map((data?.history??[]).map(group=>[group.fundId,group]));
  const today=localDate(),totalCount=data?.total??0,pendingCount=data?.pending??0,count=data?.count??0;
  const baseParams = new URLSearchParams({
    view: "transactions",
    from: range.from, to: range.to,
    ...(params.review ? { review: params.review } : {}),
    ...(params.pending ? { pending: params.pending } : {}),
    ...(params.account ? { account: params.account } : {}),
    ...(query ? { q: query } : {}),
    ...(direction ? { type: direction } : {}),
    ...(params.fund ? { fund: params.fund } : {}),
  });
  const tabParams = new URLSearchParams(baseParams);
  tabParams.delete("pending"); tabParams.delete("fund");
  const tabScope: ReclassificationScope | null = params.pending === "1" || params.fund ? {
    tab: params.pending === "1" ? "PENDING" : "FUND", ...(params.pending === "1" ? {} : { fundId: params.fund }),
    from: range.from, to: range.to, account: params.account ?? "", type: direction ?? "", q: query,
  } : null;
  const canReclassify = tabScope && !range.error && params.review !== "1" && params.review !== "merged";
  const tabLabel = params.pending === "1" ? "Chưa phân loại" : funds.find(f=>f.id===params.fund)?.code ?? "Thiện pháp";
  return (
    <div className="transaction-sheet">
      <div className="sheet-toolbar">
        <h1>Giao dịch <span>{data?count.toLocaleString("vi-VN"):"…"}</span></h1>
        <SyncRecency initial={accounts} initialNow={accounts[0]?.checkedAt ?? 0} />
      </div>
      {error&&<div className="notice danger" role="alert">{error}</div>}
      {loading&&<div className="admin-data-loading" role="status">Đang tải dữ liệu giao dịch…</div>}
      {range.error && <div className="notice danger" role="alert">{range.error}</div>}
      <TransactionTabs loading={!data} funds={funds.map(f=>{const h=historyCounts.get(f.id); const last=h?.to?localDate(new Date(h.to)):today; return {id:f.id,code:f.code,name:f.name,status:f.status,count:h?.count??0,from:h?.from?localDate(new Date(h.from)):range.from,to:last>today?last:today};})} total={totalCount} pending={pendingCount} selectedCount={count} selectedFund={params.fund} isPending={params.pending === "1"} base={tabParams.toString()} />
      {tabScope && <div className="transaction-tab-actions" aria-label={`Thao tác tab ${tabLabel}`}>
        <span>Tab <strong>{tabLabel}</strong> · {count.toLocaleString("vi-VN")} giao dịch theo bộ lọc</span>
        {canReclassify ? <TabReclassification key={JSON.stringify(tabScope)} scope={tabScope} initial={null} label={tabLabel} filterLabel={`${params.account ? "TK " + (accounts.find(a=>a.id===params.account)?.number ?? params.account) : "Cả hai tài khoản"} · ${direction === "CREDIT" ? "Thu" : direction === "DEBIT" ? "Chi" : "Thu và chi"}${query ? ` · Tìm kiếm: ${query}` : ""}`} /> : <small>Chỉ kiểm tra phân loại trong chế độ Đang ghi nhận.</small>}
      </div>}
      <section className="sheet-panel" aria-label="Danh sách giao dịch">
        <form key={apiParams.toString()} className="filter-bar" action="/admin" method="get">
          <input type="hidden" name="view" value="transactions" />
          {params.pending === "1" ? <input type="hidden" name="pending" value="1" /> : params.fund ? <input type="hidden" name="fund" value={params.fund} /> : null}
          <label>
            Tìm kiếm
            <input
              name="q"
              placeholder="Nội dung hoặc mã giao dịch"
              defaultValue={query}
            />
          </label>
          <label>Từ ngày<input type="date" name="from" defaultValue={range.from} required /></label>
          <label>Đến ngày<input type="date" name="to" defaultValue={range.to} required /></label>
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
            Đối chiếu
            <select name="review" defaultValue={params.review ?? ""}>
              <option value="">Đang ghi nhận</option>
              <option value="1">Nghi trùng — chưa cộng tổng</option>
              <option value="merged">Đã gộp / đối chiếu</option>
            </select>
          </label>
          <button className="button primary">Lọc</button>
        </form>
        {loading&&!data?<p role="status">Đang tải các giao dịch…</p>:!rows.length ? (
          <Empty title="Không có giao dịch phù hợp" />
        ) : (
          <div className="table-scroll table-card sheet-scroll" tabIndex={0} role="region" aria-label="Bảng giao dịch, cuộn để xem thêm">
            <table className="sheet-table">
              <colgroup><col className="sheet-col-index" /><col className="sheet-col-time" /><col className="sheet-col-account" /><col className="sheet-col-ref" /><col className="sheet-col-narrative" /><col className="sheet-col-money" /><col className="sheet-col-fund" /><col className="sheet-col-action" /></colgroup>
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
                    <td className="sheet-content-cell">
                      <p className="sheet-narrative">{r.narrative || "Không có nội dung"}</p>
                      <div className="sheet-content-meta">
                        {r.displayName && <span className="sheet-sender"><span>Người giao dịch:</span> <strong>{r.displayName}</strong></span>}
                        <span className="sheet-source">{r.origin === "EXCEL" ? "Nhập Excel" : "Sao kê"}</span>
                      </div>
                      {r.notes.map(note=><div key={note.id} className="transaction-admin-note"><strong>Ghi chú quản trị:</strong> {note.text}<small>{note.actorName||note.actor} · {dateTime(note.createdAt)}</small></div>)}
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
                      {r.entryStatus==="POSTED"&&<TransactionNoteEditor transactionId={r.id} narrative={r.narrative}/>}
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
                          description="Chọn thiện pháp để gán. Tài khoản nguồn và số tiền của giao dịch được giữ nguyên."
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
