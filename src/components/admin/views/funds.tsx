import Link from "next/link";
import { ExternalLink, Settings2, Plus, Sprout } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { fundTotals } from "@/lib/ledger";
import { Heading, Section, Status, Empty } from "@/components/ui";
import { vnd } from "@/lib/domain";
import { adminUrl, type AdminParams } from "@/lib/admin-navigation";
export default async function Funds({ params = {} }: { params?: AdminParams }) {
  await requireAdmin();
  const all = await fundTotals();
  const query = (params.q ?? "").trim().toLocaleLowerCase("vi");
  const funds = all.filter(
    (f) =>
      (!params.account || f.accountId === params.account) &&
      (!params.status || f.status === params.status) &&
      (!query ||
        `${f.code} ${f.name} ${f.keywords.join(" ")}`
          .toLocaleLowerCase("vi")
          .includes(query)),
  );
  const accounts = [
    ...new Map(all.map((f) => [f.accountId, f.account])).values(),
  ];
  return (
    <>
      <Heading
        eyebrow="QUẢN LÝ THIỆN PHÁP"
        title="Các thiện pháp"
        description="Quản lý trạng thái, từ khóa và nguồn hùn phước tại cùng một nơi."
      >
        <Link
          scroll={false}
          href={adminUrl("funds", { ...params, modal: "create-fund" })}
          className="button primary"
        >
          <Plus size={16} />
          Tạo thiện pháp
        </Link>
      </Heading>
      <div className="fund-counts">
        <span>
          <Sprout size={15} />
          <strong>{all.length}</strong> thiện pháp
        </span>
        <span>
          <i className="status-dot" />
          <strong>
            {all.filter((f) => f.status === "ACTIVE").length}
          </strong>{" "}
          đang hoạt động
        </span>
        <span>
          <strong>{all.filter((f) => f.status === "PAUSED").length}</strong> tạm
          dừng
        </span>
        <span>
          <strong>{all.filter((f) => f.status === "COMPLETED").length}</strong>{" "}
          hoàn thành
        </span>
      </div>
      <Section
        title="Danh sách thiện pháp"
        note="Chọn Cấu hình để sửa thông tin và quy tắc phân loại."
      >
        <form className="filter-bar" action="/admin" method="get">
          <input type="hidden" name="view" value="funds" />
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
          <label>
            Trạng thái
            <select name="status" defaultValue={params.status ?? ""}>
              <option value="">Tất cả trạng thái</option>
              <option value="ACTIVE">Đang hoạt động</option>
              <option value="PAUSED">Tạm dừng</option>
              <option value="COMPLETED">Hoàn thành</option>
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
                : "Tạo thiện pháp mới hoặc nhập bảng tổng hợp từ Sheets tại mục Đối soát đầu kỳ."}
            </span>
          </Empty>
        ) : (
          <div className="table-scroll workspace-table">
            <table>
              <thead>
                <tr>
                  <th>Thiện pháp / từ khóa</th>
                  <th>Tài khoản</th>
                  <th>Trạng thái</th>
                  <th className="align-right">Hùn phước</th>
                  <th className="align-right">Đã chi</th>
                  <th className="align-right">Số dư</th>
                  <th className="align-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {funds.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <span className="code">{f.code}</span>
                      <h3 className="table-fund-name">{f.name}</h3>
                      <small
                        className="keyword-preview"
                        title={f.keywords.join(" · ")}
                      >
                        {f.keywords.slice(0, 3).join(" · ") ||
                          "Nhận theo mã chính"}
                        {f.keywords.length > 3
                          ? ` · +${f.keywords.length - 3} từ khóa`
                          : ""}
                      </small>
                    </td>
                    <td className="nowrap">
                      <span className="account-number">{f.account.number}</span>
                      <small>{f.account.label}</small>
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
                      {vnd(f.balance)}
                    </td>
                    <td>
                      <div className="inline-actions table-actions">
                        <Link
                          scroll={false}
                          className="button subtle small"
                          href={adminUrl("funds", {
                            ...params,
                            modal: "edit-fund",
                            fundId: f.id,
                          })}
                        >
                          <Settings2 size={14} />
                          Cấu hình
                        </Link>
                        {f.account.finalizedAt && (
                          <Link
                            className="icon-button"
                            href={`/t/${f.slug}`}
                            target="_blank"
                            title={`Xem trang công khai ${f.code}`}
                            aria-label={`Xem trang công khai ${f.code}`}
                          >
                            <ExternalLink size={16} />
                          </Link>
                        )}
                      </div>
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
