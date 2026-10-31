import { requireAdmin } from "@/lib/auth";
import Link from "next/link";
import {
  ArrowRight,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  AlertCircle,
  Landmark,
} from "lucide-react";
import { accountTotals, fundTotals } from "@/lib/ledger";
import { db } from "@/lib/db";
import { dateTime, vnd } from "@/lib/domain";
import { Heading, Metric, Section, Status, Empty } from "@/components/ui";
export default async function Dashboard() {
  await requireAdmin();
  const [accounts, funds, recent, lastRun] = await Promise.all([
    accountTotals(),
    fundTotals(),
    db.bankTransaction.findMany({
      take: 6,
      orderBy: { occurredAt: "desc" },
      include: { fund: true, account: true },
    }),
    db.syncRun.findFirst({ orderBy: { startedAt: "desc" } }),
  ]);
  const total = (key: "income" | "expense" | "balance") =>
    funds.reduce((n, f) => n + f[key], 0n);
  const pending = accounts.reduce((n, a) => n + a.pendingCount, 0);
  return (
    <>
      <Heading
        eyebrow="MỖI KHOẢN HÙN, MỘT THIỆN DUYÊN"
        title="Tổng quan"
        description="Theo dõi nguồn hùn phước và hành trình phụng sự cộng đồng."
      >
        <Link href="/admin?view=sync" className="button subtle">
          <RefreshCw size={16} />
          Đồng bộ sao kê
        </Link>
        <Link
          href="/admin?modal=create-fund"
          scroll={false}
          className="button primary"
        >
          + Tạo thiện pháp
        </Link>
      </Heading>
      {accounts.some((a) => !a.finalizedAt) && (
        <div className="setup-banner">
          <div>
            <strong>Bắt đầu bằng một lần đối soát.</strong>
            <p>
              Nhập tổng lịch sử từ Sheets, xác nhận số dư ngân hàng rồi khóa sổ
              đầu kỳ để bắt đầu đồng bộ.
            </p>
          </div>
          <Link href="/admin?view=reconciliation" className="button subtle">
            Thiết lập đầu kỳ <ArrowRight size={16} />
          </Link>
        </div>
      )}
      <div className="metrics">
        <Metric
          label="Tổng hùn phước"
          value={total("income")}
          note="Gồm số liệu lịch sử đã nhập"
          accent
        />
        <Metric
          label="Tổng chi thiện pháp"
          value={total("expense")}
          note="Không bao gồm điều chuyển nội bộ"
        />
        <Metric
          label="Số dư các thiện pháp"
          value={total("balance")}
          note={`${funds.filter((f) => f.status === "ACTIVE").length} thiện pháp đang hoạt động`}
        />
      </div>
      <div className="dashboard-grid">
        <Section
          title="Các thiện pháp"
          note="Nguồn hùn phước được gìn giữ và sử dụng rõ ràng."
          action={
            <Link href="/admin?view=funds" className="text-link">
              Xem tất cả <ArrowRight size={15} />
            </Link>
          }
        >
          {!funds.length ? (
            <Empty title="Thiện pháp đầu tiên của bạn">
              <Link
                href="/admin?modal=create-fund"
                scroll={false}
                className="text-link"
              >
                Tạo thiện pháp đầu tiên →
              </Link>
            </Empty>
          ) : (
            <div className="fund-list">
              {funds.slice(0, 5).map((f) => (
                <Link
                  className="fund-row"
                  key={f.id}
                  href={`/admin?modal=edit-fund&fundId=${f.id}`}
                  scroll={false}
                >
                  <div className="fund-monogram">{f.code.slice(0, 2)}</div>
                  <div className="fund-row-main">
                    <div>
                      <span className="code">{f.code}</span>
                      <Status status={f.status} />
                    </div>
                    <h3>{f.name}</h3>
                    <div className="fund-progress">
                      <span
                        style={{
                          width: `${f.income > 0n ? Math.max(0, Math.min(100, Number((f.expense * 100n) / f.income))) : 0}%`,
                        }}
                      />
                    </div>
                    <small>
                      Đã chi {vnd(f.expense)} · Tài khoản {f.account.number}
                    </small>
                  </div>
                  <div className="fund-row-money">
                    <strong>{vnd(f.income)}</strong>
                    <small>Tổng hùn phước</small>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Section>
        <div className="right-stack">
          <Section
            title="Tài khoản sao kê"
            note="Hai nguồn, một hành trình phụng sự."
          >
            {accounts.map((a) => (
              <div className="account-card" key={a.id}>
                <span className="account-icon">
                  <Landmark size={20} />
                </span>
                <div>
                  <h3>{a.label}</h3>
                  <small>
                    {a.number} · {a.owner}
                  </small>
                  <strong>{vnd(a.expected)}</strong>
                  <small>
                    {a.finalizedAt
                      ? "Số dư tính từ mốc chốt sổ"
                      : "Chưa xác nhận số dư đầu kỳ"}
                  </small>
                </div>
              </div>
            ))}
          </Section>
          <div className="review-card">
            <AlertCircle size={23} />
            <h3>{pending} giao dịch chờ phân loại</h3>
            <p>
              Kiểm tra các khoản chưa khớp mã hoặc thiện pháp đang tạm dừng.
            </p>
            <Link href="/admin?view=transactions&pending=1">
              Mở danh sách cần xử lý <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
      <Section
        title="Giao dịch gần đây"
        note={
          lastRun
            ? `Lượt đồng bộ gần nhất: ${dateTime(lastRun.startedAt)}`
            : "Chưa có lượt đồng bộ nào."
        }
        action={
          <Link href="/admin?view=transactions" className="text-link">
            Tất cả giao dịch <ArrowRight size={15} />
          </Link>
        }
      >
        {!recent.length ? (
          <Empty title="Chưa có giao dịch đồng bộ" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Thời gian / tài khoản</th>
                  <th>Nội dung giao dịch</th>
                  <th>Thiện pháp</th>
                  <th className="align-right">Số tiền</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">
                      {dateTime(r.occurredAt)}
                      <small>{r.account.number}</small>
                    </td>
                    <td>
                      <div className="transaction-cell">
                        <span
                          className={`tx-icon ${r.direction === "DEBIT" ? "out" : ""}`}
                        >
                          {r.direction === "CREDIT" ? (
                            <ArrowDownLeft size={17} />
                          ) : (
                            <ArrowUpRight size={17} />
                          )}
                        </span>
                        <span className="narrative">{r.narrative}</span>
                      </div>
                    </td>
                    <td>
                      {r.fund ? (
                        <span className="code">{r.fund.code}</span>
                      ) : (
                        <span className="badge pending">Chờ phân loại</span>
                      )}
                    </td>
                    <td
                      className={`align-right money ${r.direction === "CREDIT" ? "positive" : ""}`}
                    >
                      {r.direction === "CREDIT" ? "+" : "−"}
                      {vnd(r.amount)}
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
