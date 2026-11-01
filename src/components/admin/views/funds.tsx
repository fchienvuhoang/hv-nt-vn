"use client";
import {summarizeBalances} from "@/lib/balance-summary";
import { LoadingIndicator } from "@/components/loading-indicator";

import { FundBalanceComparison } from "@/components/admin/fund-balance-comparison";
import { FundVisibilityButton } from "@/components/admin/fund-visibility-button";
import { FundPinButton } from "@/components/admin/fund-pin-button";
import { AdminDialogButton } from "@/components/admin/dialog-workspace";
import { RecordAuthor } from "@/components/admin/record-author";
import { AdminLink as Link } from "@/components/admin/admin-link";
import {
  ExternalLink,
  Settings2,
  Plus,
  List,
} from "lucide-react";
import type { AdminBootstrap } from "@/lib/admin-read-model";
import { Status, Empty } from "@/components/ui";
import { vnd, fundUsesAccount } from "@/lib/domain";
import { adminUrl, type AdminParams } from "@/lib/admin-navigation";
export default function Funds({ params = {},bootstrap }: { params?: AdminParams;bootstrap?:AdminBootstrap }) {
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
  const funds = matching.filter((f) => status === "ALL" || f.status === status);
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
      ? { ...f, openingBalance:a.openingBalance,availableBalance:a.availableBalance,excessExpense:a.excessExpense, income: a.income, expense: a.expense, balance: a.balance }
      : f;
  });
  const accounts = balances;
  const totals=summarizeBalances(scoped);
  return (
    <div className="fund-workspace">
      <div className="fund-topline">
        <h1>Thiện pháp</h1>
        <a href="/minh-bach" target="_blank" rel="noopener noreferrer" className="button subtle small"><ExternalLink size={14}/>Trang tổng hợp công khai</a>
        <AdminDialogButton kind="create-fund" className="button primary small">
          <Plus size={14} />Tạo thiện pháp
        </AdminDialogButton>
      </div>
      <FundBalanceComparison bootstrap={bootstrap} />
      <section className="fund-list-panel" aria-label="Danh sách thiện pháp">
        <nav className="fund-status-tabs" aria-label="Trạng thái thiện pháp">
          {tabs.map((tab) => (
            <Link key={tab.value} scroll={false}
              href={adminUrl("funds", { q: params.q, account: params.account, status: tab.value })}
              data-status={tab.value}
              aria-current={status === tab.value ? "page" : undefined}
              className={status === tab.value ? "selected" : ""}>
              {tab.label}<span>{tab.value === "ALL" ? matching.length : matching.filter((f) => f.status === tab.value).length}</span>
            </Link>
          ))}
        </nav>
        <form key={`${params.q??""}-${params.account??""}-${status}`} className="filter-bar" action="/admin" method="get">
          <input type="hidden" name="view" value="funds" />
          <input type="hidden" name="status" value={status} />
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
                  {a.number} · {a.label}
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
            <table>
              <thead>
                <tr>
                  <th>Thiện pháp / từ khóa</th>
                  <th className="fund-public-cell">Công khai</th>
                  <th>Tài khoản</th>
                  <th>Trạng thái</th>
                  <th className="align-right">Hùn phước</th>
                  <th className="align-right">Đã chi</th>
                  <th className="align-right">Số dư khả dụng</th>
                  <th className="align-right">Chi vượt quỹ</th>
                  <th className="align-right">Thao tác</th>
                  <th>Người tạo</th>
                  <th>Người cập nhật</th>
                  <th>Excel nguồn</th>
                </tr>
              </thead>
              <tbody>
                {scoped.map((f) => (
                  <tr key={f.id} className={f.pinnedAt?"fund-pinned-row":undefined}>
                    <td>
                      <div className="fund-identity">
                        <FundPinButton fundId={f.id} code={f.code} pinned={!!f.pinnedAt}/>
                        <span className="code">{f.code}</span>
                        <h3 className="table-fund-name" title={`Từ khóa: ${f.keywords.join(" · ") || f.code}`}>{f.name}</h3>
                      </div>
                    </td>
                    <td className="fund-public-cell"><div className="fund-public-controls">
                      <Link className="fund-public-link" href={`/t/${f.slug}`} target="_blank" rel="noopener noreferrer" title={`Mở trang công khai ${f.code}`} aria-label={`Mở trang công khai ${f.code} (tab mới)`}><ExternalLink size={15} /><span>Trang công khai</span></Link>
                      <FundVisibilityButton fundId={f.id} code={f.code} visible={f.publicListed}/></div>
                    </td>
                    <td className="nowrap">
                      <span className="account-number">
                        {[...new Set([f.accountId, ...f.accountIds])]
                          .map(
                            (id) => balances.find((a) => a.id === id)?.number,
                          )
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {new Set([f.accountId, ...f.accountIds]).size === 1 && <small className="fund-account-restriction">Chỉ TK {balances.find(a=>a.id===f.accountId)?.number === "0572" ? "Mỹ 0572" : balances.find(a=>a.id===f.accountId)?.number === "0856" ? "Trâm 0856" : balances.find(a=>a.id===f.accountId)?.number ?? "đã cấu hình"}</small>}
                    </td>
                    <td>
                      <Status status={f.status} />
                    </td>
                    <td className="money align-right nowrap">
                      {vnd(f.income)}
                    </td>
                    <td className="money align-right nowrap">
                      {vnd(f.expense)}
                    </td>
                    <td className="money align-right nowrap balance-value">
                      {vnd(f.availableBalance)}
                      {f.openingBalance!==0n&&<small className="fund-opening-note">Trong đó Excel: {vnd(f.openingBalance)}</small>}
                    </td>
                    <td className={`money align-right nowrap${f.excessExpense>0n?" fund-overdrawn":""}`}>{vnd(f.excessExpense)}</td>
                    <td>
                      <div className="inline-actions table-actions">
                        <AdminDialogButton kind="fund-transactions" fundId={f.id} className="button subtle small"><List size={15}/>Xem giao dịch</AdminDialogButton>
                        <AdminDialogButton kind="edit-fund" fundId={f.id} className="button subtle small">
                          <Settings2 size={14} />Cấu hình
                        </AdminDialogButton>

                      </div>
                    </td>
                    <td><RecordAuthor name={f.createdByName} id={f.createdById} at={f.createdAt} /></td>
                    <td><RecordAuthor name={f.updatedByName} id={f.updatedById} at={f.updatedAt} /></td>
                    <td className="fund-source-cell">{f.sourceUrl ? <a className="button subtle small" href={f.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`Mở Excel nguồn ${f.code} (tab mới)`}><ExternalLink size={13}/>Excel nguồn</a> : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>
                    <strong>
                      Tổng {funds.length} thiện pháp đang hiển thị
                    </strong>
                  </td>
                  <td className="money align-right nowrap">
                    {vnd(scoped.reduce((n, f) => n + f.income, 0n))}
                  </td>
                  <td className="money align-right nowrap">
                    {vnd(scoped.reduce((n, f) => n + f.expense, 0n))}
                  </td>
                  <td className="money align-right nowrap">
                    {vnd(totals.availableBalance)}
                  </td>
                  <td className={`money align-right nowrap${totals.excessExpense>0n?" fund-overdrawn":""}`}>{vnd(totals.excessExpense)}</td>
                  <td colSpan={4} />
                </tr>
                <tr><td colSpan={12} className="fund-book-balance">Số dư thực theo sổ: <strong>{totals.balance<0n?`Thiếu ${vnd(-totals.balance)}`:vnd(totals.balance)}</strong><small> = {vnd(totals.availableBalance)} khả dụng − {vnd(totals.excessExpense)} chi vượt quỹ · Theo danh sách đang hiển thị</small></td></tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
