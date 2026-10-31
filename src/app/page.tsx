import Link from "next/link";
import { ArrowRight, ShieldCheck, Sprout, Heart, ArrowUpRight } from "lucide-react";
import { Brand, Status, Empty } from "@/components/ui";
import { publicFunds } from "@/lib/public-data";
import { vnd } from "@/lib/domain";
export const dynamic = "force-dynamic";
export default async function Home() {
  const funds = process.env.DATABASE_URL ? await publicFunds() : [];
  const income = funds.reduce((n,f) => n + BigInt(f.income), 0n);
  const expense = funds.reduce((n,f) => n + BigInt(f.expense), 0n);
  return <div className="public-site"><header className="public-header"><Brand/><nav><a href="#thien-phap">Các thiện pháp</a><Link href="/login" className="button subtle">Đăng nhập quản trị <ArrowUpRight size={15}/></Link></nav></header>
    <main><section className="public-hero"><div className="hero-copy"><span className="eyebrow"><span className="small-dot"/>CÙNG GIEO DUYÊN LÀNH</span><h1>Mỗi khoản hùn phước,<br/><em>một hành trình thiện lành.</em></h1><p>Cùng theo dõi những đóng góp được trao gửi và sử dụng cho các thiện pháp. Công khai từng khoản, trọn vẹn niềm tin.</p><a className="button primary" href="#thien-phap">Theo dõi các thiện pháp <ArrowRight size={17}/></a><div className="hero-trust"><ShieldCheck size={17}/>Thu chi công khai · Bảo vệ số điện thoại thí chủ</div></div><div className="hero-art" aria-hidden="true"><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="art-flower"><Sprout size={135} strokeWidth={1}/></div><span className="art-caption">GIEO THIỆN DUYÊN<br/>NUÔI DƯỠNG NIỀM TIN</span><span className="art-spark">✧</span></div></section>
      <section className="public-summary"><div><span>Tổng hùn phước</span><strong>{vnd(income)}</strong></div><div><span>Đã phụng sự thiện pháp</span><strong>{vnd(expense)}</strong></div><div><span>Thiện pháp đang hoạt động</span><strong>{funds.filter(f => f.status === "ACTIVE").length}<small> thiện pháp</small></strong></div></section>
      <section id="thien-phap" className="public-funds"><div className="section-heading"><div><div className="eyebrow">MINH BẠCH TỪNG THIỆN PHÁP</div><h2>Cùng nhau vun bồi phước lành</h2><p>Chọn một thiện pháp để xem hùn phước, các khoản chi và số dư.</p></div><span className="pill"><Heart size={15}/>{funds.length} thiện pháp</span></div>
        {!funds.length ? <Empty title="Đang chuẩn bị số liệu">Các thiện pháp sẽ được công khai sau khi hoàn tất đối soát đầu kỳ.</Empty> : <div className="public-fund-grid">{funds.map(f => <Link className="public-fund-card" key={f.id} href={`/t/${f.slug}`}><div className="row-between"><span className="code">{f.code}</span><Status status={f.status}/></div><h3>{f.name}</h3><p>{f.description || `Tài khoản thiện nguyện ${f.account}`}</p><div className="public-fund-amount"><small>Tổng hùn phước</small><strong>{vnd(f.income)}</strong></div><div className="row-between card-footer"><span>Đã chi {vnd(f.expense)}</span><ArrowUpRight size={20}/></div></Link>)}</div>}
      </section></main><footer className="public-footer"><Brand/><span>Rõ từng khoản hùn. Trọn vẹn niềm tin.</span><small>Minh bạch cùng cộng đồng</small></footer></div>;
}
