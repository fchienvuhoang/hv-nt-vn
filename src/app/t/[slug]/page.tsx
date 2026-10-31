import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck, Clock } from "lucide-react";
import { Brand, Status, Metric, Section, Empty, Pagination, pageNumber } from "@/components/ui";
import { publicFund } from "@/lib/public-data";
import { dateTime, vnd } from "@/lib/domain";
export const dynamic = "force-dynamic";
export default async function FundPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string; type?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const page = pageNumber(query.page), direction = query.type === "DEBIT" ? "DEBIT" : "CREDIT";
  if (!/^[a-z0-9-]{1,100}$/.test(slug)) notFound();
  const fund = await publicFund(slug, page, direction);
  if (!fund) notFound();
  const base = `/t/${slug}`;
  return <div className="public-site"><header className="public-header"><Brand/><Link href="/" className="text-link"><ArrowLeft size={16}/>Tất cả thiện pháp</Link></header><main className="public-detail"><div className="fund-intro"><div className="eyebrow">HÀNH TRÌNH THIỆN LÀNH · {fund.code}</div><h1>{fund.name}</h1><div className="intro-meta"><Status status={fund.status}/><span>Tài khoản {fund.account}</span></div>{fund.description && <p>{fund.description}</p>}<div className="public-update"><Clock size={14}/>{fund.syncAt ? `Đã đồng bộ đầy đủ đến lượt ${dateTime(fund.syncAt)}` : "Đang chờ hoàn tất đồng bộ đầu tiên"}<span>·</span> Bản hiển thị: {dateTime(fund.generatedAt)}</div></div>
      <div className="metrics"><Metric label="Tổng hùn phước" value={fund.income} note="Gồm tổng lịch sử trước ngày chuyển đổi" accent/><Metric label="Tổng chi" value={fund.expense} note="Các khoản chi thực tế của thiện pháp"/><Metric label="Số dư thiện pháp" value={fund.balance} note="Đã tính cả điều chuyển nội bộ"/></div>
      <div className="public-transfers-summary"><span>Điều chuyển vào: <strong>{vnd(fund.transferIn)}</strong></span><span>Điều chuyển ra: <strong>{vnd(fund.transferOut)}</strong></span><span>Điều chuyển ròng trước chốt: <strong>{vnd(fund.openingTransferNet)}</strong></span></div>
      <Section title="Danh sách hùn phước & khoản chi" note="Số điện thoại được che, giữ 3 số cuối để đối chiếu."><div className="tabs"><Link className={direction === "CREDIT" ? "selected" : ""} href={`${base}?type=CREDIT`}>Khoản hùn phước</Link><Link className={direction === "DEBIT" ? "selected" : ""} href={`${base}?type=DEBIT`}>Khoản chi</Link></div>
        <div className="notice historical-note">Trước {fund.cutover ? dateTime(fund.cutover) : "ngày chuyển đổi"}: hùn phước <strong>{vnd(fund.openingIncome)}</strong>, chi <strong>{vnd(fund.openingExpense)}</strong>. Đây là tổng lịch sử từ sổ cũ; danh sách bên dưới ghi nhận từ ngày chuyển đổi.</div>
        {!fund.rows.length ? <Empty title={direction === "CREDIT" ? "Chưa có khoản hùn phước mới" : "Chưa có khoản chi mới"}>Số liệu lịch sử đã được tính trong các tổng ở trên.</Empty> : <div className="table-scroll"><table><thead><tr><th>Thời gian</th><th>Nội dung {direction === "CREDIT" ? "hùn phước" : "khoản chi"}</th><th className="align-right">Số tiền</th></tr></thead><tbody>{fund.rows.map(r => <tr key={r.id}><td className="nowrap">{dateTime(r.at)}</td><td><p className="narrative">{r.narrative || "Không có nội dung chuyển khoản"}</p><small>{r.name}</small></td><td className={`align-right money nowrap ${direction === "CREDIT" ? "positive" : ""}`}>{vnd(r.amount)}</td></tr>)}</tbody></table></div>}
        <Pagination page={page} total={fund.count} base={`${base}?type=${direction}`}/>
      </Section>
      <Section title="Điều chuyển nội bộ" note="50 bút toán gần nhất; bao gồm bút toán đảo, không tính thành hùn phước hoặc chi mới.">{!fund.transfers.length ? <p className="muted padded">Chưa có điều chuyển kể từ ngày chuyển đổi.</p> : <div className="table-scroll"><table><thead><tr><th>Thời gian</th><th>Từ → đến</th><th>Lý do</th><th className="align-right">Số tiền</th></tr></thead><tbody>{fund.transfers.map(t => <tr key={t.id}><td className="nowrap">{dateTime(t.at)}</td><td className="code nowrap">{t.from} → {t.to}{t.reversal && <small>Bút toán đảo</small>}</td><td>{t.reason}</td><td className="align-right money nowrap">{vnd(t.amount)}</td></tr>)}</tbody></table></div>}</Section>
      <div className="public-assurance"><ShieldCheck size={20}/><p>Số liệu được cập nhật từ sao kê và đối soát của ban quản trị. Điều chuyển là phân bổ giữa các thiện pháp trong cùng tài khoản.</p></div>
    </main><footer className="public-footer"><Brand/><span>Tri ân mọi thiện duyên được trao gửi.</span></footer></div>;
}
