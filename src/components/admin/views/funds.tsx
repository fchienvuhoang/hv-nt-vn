import { AdminDialogButton } from "@/components/admin/dialog-workspace";
import { RecordAuthor } from "@/components/admin/record-author";
import Link from "next/link";
import {
  ExternalLink,
  Settings2,
  Plus,
  FileUp,
  List,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { fundTotals, accountTotals } from "@/lib/ledger";
import { Status, Empty } from "@/components/ui";
import { vnd, fundUsesAccount } from "@/lib/domain";
import { adminUrl, type AdminParams } from "@/lib/admin-navigation";
export default async function Funds({ params = {} }: { params?: AdminParams }) {
  await requireAdmin();
  const [all, balances] = await Promise.all([fundTotals(), accountTotals()]);
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
      ? { ...f, income: a.income, expense: a.expense, balance: a.balance }
      : f;
  });
  const accounts = balances;
  return (
    <div className="fund-workspace">
      <div className="fund-topline">
        <h1>Thiện pháp</h1>
        <div className="fund-account-inline" aria-label="Tổng tiền theo tài khoản">
          {balances.map((a) => (
            <span key={a.id} title={`${a.label}. Số dư dự kiến, không phải xác nhận trực tiếp từ ngân hàng.`}>
              TK {a.number}: Hùn <strong>{vnd(a.income)}</strong>
              <span className="fund-inline-balance"> · Dư <strong>{vnd(a.expected)}</strong></span>
              {a.reviewCount > 0 && <Link href={`/admin?view=transactions&review=1&account=${a.id}`} className="fund-inline-review"> · {a.reviewCount} nghi trùng</Link>}
            </span>
          ))}
        </div>
        <AdminDialogButton kind="create-fund" className="button primary small">
          <Plus size={14} />Tạo thiện pháp
        </AdminDialogButton>
      </div>
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
        <form className="filter-bar" action="/admin" method="get">
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
        {!funds.length ? (
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
                  <th>Người tạo</th>
                  <th>Người cập nhật</th>
                  <th className="align-right">Hùn phước</th>
                  <th className="align-right">Đã chi</th>
                  <th className="align-right">Số dư</th>
                  <th className="align-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {scoped.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <div className="fund-identity">
                        <span className="code">{f.code}</span>
                        <h3 className="table-fund-name" title={`Từ khóa: ${f.keywords.join(" · ") || f.code}`}>{f.name}</h3>
                      </div>
                    </td>
                    <td className="fund-public-cell">
                      <Link className="fund-public-link" href={`/t/${f.slug}`} target="_blank" rel="noopener noreferrer" title={`Mở trang công khai ${f.code}`} aria-label={`Mở trang công khai ${f.code} (tab mới)`}><ExternalLink size={15} /><span>Trang công khai</span></Link>
                    </td>
                    <td className="nowrap">
                      <span className="account-number">
                        {[f.accountId, ...f.accountIds]
                          .map(
                            (id) => balances.find((a) => a.id === id)?.number,
                          )
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </td>
                    <td>
                      <Status status={f.status} />
                    </td>
                    <td><RecordAuthor name={f.createdByName} id={f.createdById} at={f.createdAt} /></td>
                    <td><RecordAuthor name={f.updatedByName} id={f.updatedById} at={f.updatedAt} /></td>
                    <td className="money align-right nowrap">
                      {vnd(f.income)}
                    </td>
                    <td className="money align-right nowrap">
                      {vnd(f.expense)}
                    </td>
                    <td className="money align-right nowrap balance-value">
                      {vnd(f.balance)}
                    </td>
                    <td>
                      <div className="inline-actions table-actions">
                        <AdminDialogButton kind="import-fund" fundId={f.id} className="button subtle small">
                          <FileUp size={14} />Nhập Excel
                        </AdminDialogButton>
                        <Link
                          href={`/admin?view=transactions&fund=${f.id}`}
                          className="icon-button"
                          aria-label={`Giao dịch ${f.code}`}
                          title={`Giao dịch ${f.code}`}
                        >
                          <List size={16} />
                        </Link>
                        <AdminDialogButton kind="edit-fund" fundId={f.id} className="button subtle small">
                          <Settings2 size={14} />Cấu hình
                        </AdminDialogButton>

                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6}>
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
                    {vnd(scoped.reduce((n, f) => n + f.balance, 0n))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
