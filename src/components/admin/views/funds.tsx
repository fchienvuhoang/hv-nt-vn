"use client";
import {SITE_ORIGIN} from "@/lib/site-url";
import { useToast } from "@/components/toasts";
import { accountLabel } from "@/lib/account-label";
import {summarizeBalances} from "@/lib/balance-summary";
import { LoadingIndicator } from "@/components/loading-indicator";

import { FundBalanceComparison } from "@/components/admin/fund-balance-comparison";
import { FundPinButton } from "@/components/admin/fund-pin-button";
import { AdminDialogButton } from "@/components/admin/dialog-workspace";
import { RecordAuthor } from "@/components/admin/record-author";
import { AdminLink as Link } from "@/components/admin/admin-link";
import {
  ExternalLink,
  Copy,
  Settings2,
  Plus,
  List,
} from "lucide-react";
import type { AdminBootstrap } from "@/lib/admin-read-model";
import { Status, Empty } from "@/components/ui";
import { vnd, fundUsesAccount } from "@/lib/domain";
import { adminUrl, type AdminParams } from "@/lib/admin-navigation";
function FundingProgress({ income, goal }: { income: bigint; goal: bigint | null }) {
  if (goal === null || goal <= 0n) return null;
  const percentage = Number((income > 0n ? income : 0n) * 1000n / goal) / 10;
  const label = `${percentage.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
  return <div className="fund-funding-progress">
    <div><span>Mục tiêu: <b>{vnd(goal)}</b></span><strong>{label}</strong></div>
    <progress max={100} value={Math.min(100, percentage)} aria-label="Tiến độ thành tựu" aria-valuetext={label}/>
  </div>;
}

export default function Funds({ params = {},bootstrap }: { params?: AdminParams;bootstrap?:AdminBootstrap }) {
  const toast=useToast();
  async function copyPublicLink(slug:string){
    try{await navigator.clipboard.writeText(new URL(`/t/${slug}`,SITE_ORIGIN).href);toast("Đã sao chép link trang công khai.");}
    catch{toast("Không sao chép được. Vui lòng cho phép truy cập bộ nhớ tạm rồi thử lại.","error");}
  }
  const all=[...(bootstrap?.funds??[])].sort((a,b)=>(b.pinnedAt?.getTime()??0)-(a.pinnedAt?.getTime()??0)),balances=bootstrap?.balances??[];
  const query = (params.q ?? "").trim().toLocaleLowerCase("vi");
  const status = ["ACTIVE", "COMPLETED", "PAUSED", "ALL"].includes(params.status ?? "")
    ? params.status! : "ACTIVE";
  const matching = all.filter(
    (f) =>
      (!params.account || fundUsesAccount(f, params.account)) &&
      (!query ||
        `${f.code} ${f.name} ${f.keywords.join(" ")}`
          .toLocaleLowerCase("vi")
          .includes(query)),
  );
  const term=["LONG","SHORT"].includes(params.term??"")?params.term!:"ALL";
  const termMatching=matching.filter(f=>term==="ALL"||(term==="LONG"?f.isLongTerm:!f.isLongTerm));
  const funds = termMatching.filter((f) => status === "ALL" || f.status === status);
  const termTabs=[{value:"LONG",label:"Dài hạn"},{value:"SHORT",label:"Ngắn hạn"},{value:"ALL",label:"Tất cả"}];
  const tabs = [
    { value: "ACTIVE", label: "Đang hoạt động" },
    { value: "COMPLETED", label: "Hoàn thành" },
    { value: "PAUSED", label: "Tạm dừng" },
    { value: "ALL", label: "Tất cả" },
  ];
  const scoped = funds.map((f) => {
    const a = params.account
      ? f.byAccount.find((a) => a.accountId === params.account)
      : null;
    return a
      ? { ...f, openingBalance:a.openingBalance,availableBalance:a.availableBalance,excessExpense:a.excessExpense, income: a.income, fundingIncome:a.fundingIncome, expense: a.expense, balance: a.balance }
      : f;
  });
  const accounts = balances;
  const totals=summarizeBalances(scoped);
  return (
    <div className="fund-workspace">
      <div className="fund-topline">
        <h1>Thiện pháp</h1>
        <AdminDialogButton kind="create-fund" className="button primary small">
          <Plus size={14} />Tạo thiện pháp
        </AdminDialogButton>
      </div>
      <FundBalanceComparison bootstrap={bootstrap} />
      <section className="fund-list-panel" aria-label="Danh sách thiện pháp">
        <nav className="fund-term-tabs" aria-label="Thời hạn thiện pháp">
          {termTabs.map(tab=><Link key={tab.value} href={adminUrl("funds",{q:params.q,account:params.account,status,term:tab.value})} aria-current={term===tab.value?"page":undefined} className={term===tab.value?"selected":""}>{tab.label}<span>{matching.filter(f=>(status==="ALL"||f.status===status)&&(tab.value==="ALL"||(tab.value==="LONG"?f.isLongTerm:!f.isLongTerm))).length}</span></Link>)}
        </nav>
        <nav className="fund-status-tabs" aria-label="Trạng thái thiện pháp">
          {tabs.map((tab) => (
            <Link key={tab.value} scroll={false}
              href={adminUrl("funds", { q: params.q, account: params.account, term, status: tab.value })}
              data-status={tab.value}
              aria-current={status === tab.value ? "page" : undefined}
              className={status === tab.value ? "selected" : ""}>
              {tab.label}<span>{tab.value === "ALL" ? termMatching.length : termMatching.filter((f) => f.status === tab.value).length}</span>
            </Link>
          ))}
        </nav>
        <form key={`${params.q??""}-${params.account??""}-${status}`} className="filter-bar" action="/admin" method="get">
          <input type="hidden" name="view" value="funds" />
          <input type="hidden" name="status" value={status} />
          <input type="hidden" name="term" value={term} />
          <label>
            Tìm thiện pháp
            <input
              name="q"
              defaultValue={params.q}
              placeholder="Tên, mã hoặc từ khóa…"
            />
          </label>
          <label>
            Tài khoản
            <select name="account" defaultValue={params.account ?? ""}>
              <option value="">Tất cả tài khoản</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountLabel(a.number)} · {a.label}
                </option>
              ))}
            </select>
          </label>
          <button className="button subtle">Lọc danh sách</button>
        </form>
        {!bootstrap?<LoadingIndicator label="Đang tải danh sách thiện pháp…"/>:!funds.length ? (
          <Empty
            title={
              all.length
                ? "Không có thiện pháp phù hợp"
                : "Bắt đầu với thiện pháp đầu tiên"
            }
          >
            <span>
              {all.length
                ? "Thử đổi từ khóa hoặc bộ lọc."
                : "Tạo thiện pháp mới rồi chọn Nhập Excel để nhập lịch sử từ Sheets."}
            </span>
          </Empty>
        ) : (
          <div className="table-scroll table-card fund-list-scroll" tabIndex={0} role="region" aria-label="Bảng thiện pháp">
            <table role="table">
              <thead role="rowgroup">
                <tr>
                  <th>Thiện pháp / từ khóa</th>
                  <th>Tài khoản</th>
                  <th>Trạng thái</th>
                  <th className="align-right">Hùn phước</th>
                  <th className="align-right">Đã chi</th>
                  <th className="align-right">Số dư khả dụng</th>
                  <th className="align-right">Chi vượt quỹ</th>
                  <th className="align-right">Thao tác</th>
                  <th>Người tạo</th>
                  <th>Người cập nhật</th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {scoped.map((f) => (
                  <tr role="row" key={f.id} className={f.pinnedAt?"fund-pinned-row":undefined}>
                    <td>
                      <div className="fund-identity">
                        <FundPinButton fundId={f.id} code={f.code} pinned={!!f.pinnedAt}/>
                        <span className="code">{f.code}</span>
                        <h3 className="table-fund-name" title={`${f.code} · ${f.name}${f.keywords.length ? ` (Từ khóa: ${f.keywords.join(" · ")})` : ""}`}>{f.name}</h3>
                      </div>
                      {f.keywords.length > 0 && <div className="fund-aliases" aria-label="Mã phụ và từ khóa">{f.keywords.map(keyword=><span key={keyword}>{keyword}</span>)}</div>}
                    </td>
                    <td className="nowrap">
                      <span className="account-number">
                        {[...new Set([f.accountId, ...f.accountIds])]
                          .map(
                            (id) => balances.find((a) => a.id === id)?.number,
                          )
                          .filter((number): number is string => !!number)
                          .map(accountLabel)
                          .join(" · ")}
                      </span>
                      {new Set([f.accountId, ...f.accountIds]).size === 1 && <small className="fund-account-restriction">Chỉ TK {accountLabel(balances.find(a=>a.id===f.accountId)?.number ?? "đã cấu hình")}</small>}
                    </td>
                    <td>
                      <Status status={f.status} />
                      <div className="fund-status-public-link"><Link className="fund-public-link" href={`/t/${f.slug}`} target="_blank" rel="noopener noreferrer" title={`Mở trang công khai ${f.code}`} aria-label={`Mở trang công khai ${f.code} (tab mới)`}><ExternalLink size={13} /><span>Trang công khai</span></Link><button type="button" className="fund-copy-link" onClick={()=>void copyPublicLink(f.slug)} title={`Sao chép link công khai ${f.code}`} aria-label={`Sao chép link công khai ${f.code}`}><Copy size={13}/></button></div>
                    </td>
                    <td data-label="Hùn phước" className="money align-right nowrap">
                      {vnd(f.fundingIncome)}
                      <FundingProgress income={f.fundingIncome} goal={f.goalAmount}/>
                      {(f.transferIn!==0n||f.transferOut!==0n)&&<small>Đã tính điều chuyển ròng</small>}
                      {f.adminNote && <div className="fund-income-note"><strong>Ghi chú:</strong> {f.adminNote}</div>}
                    </td>
                    <td data-label="Đã chi" className="money align-right nowrap">
                      {vnd(f.expense)}
                    </td>
                    <td data-label="Số dư khả dụng" className="money align-right nowrap balance-value">
                      {vnd(f.availableBalance)}
                      {f.openingBalance!==0n&&<small className="fund-opening-note">Trong đó Excel: {vnd(f.openingBalance)}</small>}
                    </td>
                    <td data-label="Chi vượt quỹ" className={`money align-right nowrap${f.excessExpense>0n?" fund-overdrawn":""}`}>{vnd(f.excessExpense)}</td>
                    <td>
                      {f.adminNote&&<div className="fund-mobile-note"><strong>Ghi chú:</strong> {f.adminNote}</div>}
                      <details className="fund-mobile-details">
                        <summary>Thông tin thêm</summary>
                        {f.keywords.length>0&&<div className="fund-aliases">{f.keywords.map(keyword=><span key={keyword}>{keyword}</span>)}</div>}
                        {f.goalAmount!=null&&<div>Mục tiêu thành tựu: <strong>{vnd(f.goalAmount)}</strong></div>}
                        {f.openingBalance!==0n&&<div>Trong đó Excel: {vnd(f.openingBalance)}</div>}
                        <div><small>Người tạo</small><RecordAuthor name={f.createdByName} id={f.createdById} at={f.createdAt}/></div>
                        <div><small>Cập nhật</small><RecordAuthor name={f.updatedByName} id={f.updatedById} at={f.updatedAt}/></div>
                      </details>
                      <div className="inline-actions table-actions">
                        <AdminDialogButton kind="fund-transactions" fundId={f.id} className="button subtle small"><List size={15}/>Xem giao dịch</AdminDialogButton>
                        <AdminDialogButton kind="edit-fund" fundId={f.id} className="button subtle small">
                          <Settings2 size={14} />Cấu hình
                        </AdminDialogButton>

                      </div>
                    </td>
                    <td data-label="Người tạo"><RecordAuthor name={f.createdByName} id={f.createdById} at={f.createdAt} /></td>
                    <td data-label="Cập nhật"><RecordAuthor name={f.updatedByName} id={f.updatedById} at={f.updatedAt} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>
                    <strong>
                      Tổng {funds.length} thiện pháp đang hiển thị
                    </strong>
                  </td>
                  <td data-label="Hùn phước" className="money align-right nowrap">
                    {vnd(scoped.reduce((n, f) => n + f.fundingIncome, 0n))}
                  </td>
                  <td data-label="Đã chi" className="money align-right nowrap">
                    {vnd(scoped.reduce((n, f) => n + f.expense, 0n))}
                  </td>
                  <td data-label="Số dư khả dụng" className="money align-right nowrap">
                    {vnd(totals.availableBalance)}
                  </td>
                  <td data-label="Chi vượt quỹ" className={`money align-right nowrap${totals.excessExpense>0n?" fund-overdrawn":""}`}>{vnd(totals.excessExpense)}</td>
                  <td colSpan={3} />
                </tr>
                <tr><td colSpan={10} className="fund-book-balance">Số dư thực theo sổ: <strong>{totals.balance<0n?`Thiếu ${vnd(-totals.balance)}`:vnd(totals.balance)}</strong><small> = {vnd(totals.availableBalance)} khả dụng − {vnd(totals.excessExpense)} chi vượt quỹ · Theo danh sách đang hiển thị</small></td></tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
