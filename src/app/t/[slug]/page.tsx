import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck, Clock, Search } from "lucide-react";
import {
  Brand,
  Status,
  Metric,
  Section,
  Empty,
  Pagination,
  pageNumber,
} from "@/components/ui";
import { publicFund, PUBLIC_PAGE_SIZE } from "@/lib/public-data";
import { dateTime, vnd } from "@/lib/domain";
export const dynamic = "force-dynamic";
export default async function FundPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string; type?: string; q?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const page = pageNumber(query.page),
    direction = query.type === "DEBIT" ? "DEBIT" : "CREDIT";
  if (!/^[a-z0-9-]{1,100}$/.test(slug)) notFound();
  const search = (typeof query.q === "string" ? query.q : "").trim().slice(0,100);
  const fund = await publicFund(slug, page, direction, search);
  if (!fund) notFound();
  const base = `/t/${slug}`;
  return (
    <div className="public-site">
      <header className="public-header">
        <Brand href={base} />
      </header>
      <main className="public-detail public-compact">
        <div className="fund-intro">
          <div className="eyebrow">HÀNH TRÌNH THIỆN LÀNH · {fund.code}</div>
          <h1>{fund.name}</h1>
          <div className="intro-meta">
            <Status status={fund.status} />
            <span>Tài khoản {fund.account}</span>
          </div>
          {fund.description && <p>{fund.description}</p>}
          <div className="public-update">
            <Clock size={14} />
            {fund.syncAt
              ? `Đã đồng bộ đầy đủ đến lượt ${dateTime(fund.syncAt)}`
              : "Đang chờ hoàn tất đồng bộ đầu tiên"}
            <span>·</span> Bản hiển thị: {dateTime(fund.generatedAt)}
          </div>
        </div>
        {fund.pendingImports > 0 && (
          <div className="notice">
            Đang nhập lịch sử Excel; số liệu có thể chưa đầy đủ cho tới khi nhập
            xong.
          </div>
        )}
        <div className="metrics">
          <Metric
            label="Tổng hùn phước"
            value={fund.income}
            note="Các khoản hùn phước đã ghi nhận"
            accent
          />
          <Metric
            label="Tổng chi"
            value={fund.expense}
            note="Các khoản chi thực tế của thiện pháp"
          />
          <Metric
            label="Số dư thiện pháp"
            value={fund.balance}
            note="Đã tính cả điều chuyển nội bộ"
          />
        </div>
        <div className="public-transfers-summary">
          <span>
            Điều chuyển vào: <strong>{vnd(fund.transferIn)}</strong>
          </span>
          <span>
            Điều chuyển ra: <strong>{vnd(fund.transferOut)}</strong>
          </span>
          <span>
            Điều chuyển ròng lịch sử:{" "}
            <strong>{vnd(fund.openingTransferNet)}</strong>
          </span>
        </div>
        <div className="public-ledger-card">
        <Section
          title="Danh sách hùn phước & khoản chi"
          note="Số điện thoại được che, giữ 3 số cuối để đối chiếu."
        >
          <div className="public-ledger-tools">
          <div className="tabs">
            <Link
              className={direction === "CREDIT" ? "selected" : ""}
              href={`${base}?${new URLSearchParams({type:"CREDIT",...(search?{q:search}:{})})}`}
            >
              Khoản hùn phước
            </Link>
            <Link
              className={direction === "DEBIT" ? "selected" : ""}
              href={`${base}?${new URLSearchParams({type:"DEBIT",...(search?{q:search}:{})})}`}
            >
              Khoản chi
            </Link>
          </div>
          <form action={base} method="get" className="public-search" role="search">
            <input type="hidden" name="type" value={direction} />
            <label htmlFor="public-transaction-search">Tìm khoản hùn phước / khoản chi</label>
            <div className="public-search-controls">
              <input id="public-transaction-search" type="search" name="q" defaultValue={search} maxLength={100} placeholder="Nội dung, tên thí chủ, số tiền hoặc 3 số cuối điện thoại…" />
              <button className="button primary" type="submit"><Search size={15} />Tìm kiếm</button>
              {search&&<Link className="button subtle" href={`${base}?type=${direction}`}>Xóa tìm kiếm</Link>}
            </div>
            <small>{fund.count.toLocaleString("vi-VN")} giao dịch{search?` khớp “${search}”`:""} · 100 dòng/trang</small>
          </form>
          </div>
          {(BigInt(fund.openingIncome) !== 0n ||
            BigInt(fund.openingExpense) !== 0n) && (
            <div className="notice historical-note">
              Tổng lịch sử cũ đã được tính: hùn phước {vnd(fund.openingIncome)},
              chi {vnd(fund.openingExpense)}. Các khoản này chưa có chi tiết
              được nhập từ Excel.
            </div>
          )}
          {!fund.rows.length ? (
            <Empty
              title={
                search ? "Không tìm thấy giao dịch phù hợp" : direction === "CREDIT"
                  ? "Chưa có khoản hùn phước mới"
                  : "Chưa có khoản chi mới"
              }
            >
              {search?"Hãy thử tên, nội dung hoặc 3 số cuối điện thoại. Các tổng thu chi phía trên luôn là tổng toàn thiện pháp.":"Số liệu lịch sử đã được tính trong các tổng ở trên."}
            </Empty>
          ) : (
            <div className="table-scroll table-card">
              <table>
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>
                      Nội dung{" "}
                      {direction === "CREDIT" ? "hùn phước" : "khoản chi"}
                    </th>
                    <th className="align-right">Số tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {fund.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="nowrap">{dateTime(r.at)}<small>TK {r.account}</small></td>
                      <td>
                        <p className="narrative">
                          {r.narrative || "Không có nội dung chuyển khoản"}
                        </p>
                        <small>{r.name}</small>
                        {r.notes.map(note=><div key={note.id} className="transaction-public-note"><strong>Ghi chú quản trị:</strong> {note.text}<small>{dateTime(note.at)}</small></div>)}
                      </td>
                      <td
                        className={`align-right money nowrap ${direction === "CREDIT" ? "positive" : ""}`}
                      >
                        {vnd(r.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={fund.page}
            total={fund.count}
            base={`${base}?${new URLSearchParams({type:direction,...(search?{q:search}:{})})}`}
            pageSize={PUBLIC_PAGE_SIZE}
          />
        </Section>
        </div>
        <Section
          title="Điều chuyển nội bộ"
          note="50 bút toán gần nhất; bao gồm bút toán đảo, không tính thành hùn phước hoặc chi mới."
        >
          {!fund.transfers.length ? (
            <p className="muted padded">
              Chưa có điều chuyển kể từ ngày chuyển đổi.
            </p>
          ) : (
            <div className="table-scroll table-card">
              <table>
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Từ → đến</th>
                    <th>Lý do</th>
                    <th className="align-right">Số tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {fund.transfers.map((t) => (
                    <tr key={t.id}>
                      <td className="nowrap">{dateTime(t.at)}</td>
                      <td className="code nowrap">
                        {t.from} → {t.to}
                        {t.reversal && <small>Bút toán đảo</small>}
                      </td>
                      <td>{t.reason}</td>
                      <td className="align-right money nowrap">
                        {vnd(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
        <div className="public-assurance">
          <ShieldCheck size={20} />
          <p>
            Số liệu được cập nhật từ sao kê và đối soát của ban quản trị. Điều
            chuyển là phân bổ giữa các thiện pháp trong cùng tài khoản.
          </p>
        </div>
      </main>
      <footer className="public-footer">
        <Brand href={base} />
        <span>Tri ân mọi thiện duyên được trao gửi.</span>
      </footer>
    </div>
  );
}
