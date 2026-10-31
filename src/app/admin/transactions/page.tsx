import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Heading, Section, Empty, Pagination, pageNumber } from "@/components/ui";
import { dateTime, vnd } from "@/lib/domain";
import { ActionForm } from "@/components/action-form";
import { assignTransaction, reclassifyPending } from "../actions";
import type { Prisma } from "@/generated/prisma/client";
export default async function Transactions({ searchParams }: { searchParams: Promise<{ page?: string; pending?: string; account?: string; q?: string; type?: string; fund?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const page = pageNumber(params.page);
  const query = (params.q ?? "").slice(0,100);
  const direction = params.type === "CREDIT" || params.type === "DEBIT" ? params.type : undefined;
  const where: Prisma.BankTransactionWhereInput = { ...(params.pending === "1" ? { fundId: null } : params.fund ? { fundId: params.fund } : {}), ...(params.account ? { accountId: params.account } : {}), ...(direction ? { direction } : {}), ...(query ? { OR: [{ narrative: { contains: query, mode: "insensitive" } }, { refId: { contains: query, mode: "insensitive" } }] } : {}) };
  const [rows, count, accounts, funds] = await Promise.all([
    db.bankTransaction.findMany({ where, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], skip: (page-1)*30, take: 30, include: { fund: true, account: true } }),
    db.bankTransaction.count({ where }), db.bankAccount.findMany(), db.fund.findMany({ orderBy: { code: "asc" } }),
  ]);
  const baseParams = new URLSearchParams({ ...(params.pending ? { pending: params.pending } : {}), ...(params.account ? { account: params.account } : {}), ...(query ? { q: query } : {}), ...(direction ? { type: direction } : {}), ...(params.fund ? { fund: params.fund } : {}) });
  return <><Heading eyebrow="SAO KÊ & PHÂN LOẠI" title="Giao dịch" description="Sao kê gốc được lưu riêng. Mọi lần gán tay đều có người thực hiện và lý do."/>
    <Section title="Tìm và phân loại" action={<ActionForm action={reclassifyPending} label="Chạy lại phân loại chờ" className="compact"/>}>
      <form className="filter-bar" method="get"><label>Tìm kiếm<input name="q" placeholder="Nội dung hoặc mã giao dịch" defaultValue={query}/></label><label>Tài khoản<select name="account" defaultValue={params.account ?? ""}><option value="">Tất cả tài khoản</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.number} · {a.label}</option>)}</select></label><label>Thu / chi<select name="type" defaultValue={direction ?? ""}><option value="">Tất cả</option><option value="CREDIT">Thu</option><option value="DEBIT">Chi</option></select></label><label>Phân loại<select name="pending" defaultValue={params.pending ?? ""}><option value="">Tất cả</option><option value="1">Chưa phân loại</option></select></label><button className="button primary">Lọc</button></form>
      {!rows.length ? <Empty title="Không có giao dịch phù hợp"/> : <div className="table-scroll"><table><thead><tr><th>Thời gian / tài khoản</th><th>Nội dung gốc</th><th className="align-right">Số tiền</th><th>Phân loại</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td className="nowrap">{dateTime(r.occurredAt)}<small>{r.account.number} · {r.refId}</small></td><td className="wide-cell"><p className="narrative">{r.narrative || "Không có nội dung"}</p><small>{r.displayName}</small></td><td className={`align-right money nowrap ${r.direction === "CREDIT" ? "positive" : ""}`}>{r.direction === "CREDIT" ? "+" : "−"}{vnd(r.amount)}</td><td className="classification-cell"><span className={`badge ${r.fund ? "active" : "pending"}`}>{r.fund?.code ?? "Chờ phân loại"}</span><small>{r.assignment === "MANUAL" ? "Gán tay" : r.assignment === "AUTO" ? "Tự động" : "Chưa gán"} · {r.matchReason}</small><details><summary>{r.fund ? "Đổi thiện pháp" : "Gán bằng tay"}</summary><ActionForm action={assignTransaction} label="Xác nhận gán"><input type="hidden" name="transactionId" value={r.id}/><label>Thiện pháp<select name="fundId" defaultValue={r.fundId ?? ""} required><option value="" disabled>Chọn thiện pháp</option>{funds.filter(f => f.accountId === r.accountId).map(f => <option key={f.id} value={f.id}>{f.code} · {f.name}{f.status === "ACTIVE" ? "" : f.status === "PAUSED" ? " (Tạm dừng)" : " (Hoàn thành)"}</option>)}</select></label><label>Lý do<input name="reason" required minLength={5} maxLength={1000} placeholder="Lý do phân loại / điều chỉnh"/></label></ActionForm></details></td></tr>)}</tbody></table></div>}
      <Pagination page={page} total={count} base={`/admin/transactions?${baseParams}`}/>
    </Section></>;
}
