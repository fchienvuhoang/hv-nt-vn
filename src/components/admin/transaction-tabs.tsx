"use client";
import Link from "next/link";
import { useState } from "react";
import { Search, ChevronDown } from "lucide-react";
import { Modal, useCloseModal } from "@/components/modal";
import { normalize } from "@/lib/domain";
type FundTab = { id: string; code: string; name: string; status: string; count: number; from: string; to: string };
function FundChoices({ funds, base, selected }: { funds: FundTab[]; base: string; selected?: string }) {
  const [search, setSearch] = useState("");
  const close = useCloseModal();
  const query = normalize(search).replace(/ /g, "");
  const matches = funds.filter(f=>normalize(`${f.code} ${f.name}`).replace(/ /g, "").includes(query));
  function fundHref(fund: FundTab) { const params = new URLSearchParams(base); params.set("fund",fund.id); params.set("from",fund.from); params.set("to",fund.to); return `/admin?${params}`; }
  return <div className="transaction-fund-picker">
    <label className="fund-picker-search"><Search size={15} aria-hidden="true" /><input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Tìm mã hoặc tên thiện pháp…" aria-label="Tìm thiện pháp để xem giao dịch" /></label>
    <div className="fund-picker-hint">Chọn một thiện pháp để xem toàn bộ lịch sử đã gán, không giới hạn ngày đang xem. Bộ lọc tài khoản, thu/chi, tìm kiếm và đối chiếu vẫn được giữ.</div>
    <div className="transaction-fund-choices">
      {matches.map(f=><Link key={f.id} href={fundHref(f)} scroll={false} onClick={close} className={f.id===selected?"selected":""} aria-current={f.id===selected?"page":undefined}>
        <span className="fund-choice-identity"><strong>{f.code}</strong><span>{f.name}</span><small>{f.status==="ACTIVE"?"Đang hoạt động":f.status==="PAUSED"?"Tạm dừng":"Hoàn thành"}</small></span>
        <span className="transaction-tab-count">{f.count.toLocaleString("vi-VN")}</span>
      </Link>)}
      {!matches.length && <p className="fund-picker-hint">Không có thiện pháp phù hợp.</p>}
    </div>
  </div>;
}
export function TransactionTabs({ funds, total, pending, selectedFund, selectedCount, isPending, base }: { funds: FundTab[]; total: number; pending: number; selectedFund?: string; selectedCount: number; isPending: boolean; base: string }) {
  const selected = !isPending ? funds.find(f=>f.id===selectedFund) : undefined;
  const allHref = `/admin?${base}`;
  const pendingParams = new URLSearchParams(base); pendingParams.set("pending","1");
  return <nav className="transaction-category-tabs" aria-label="Nhóm giao dịch">
    <Link href={allHref} scroll={false} className={!isPending&&!selectedFund?"selected":""} aria-current={!isPending&&!selectedFund?"page":undefined}>Tất cả <span className="transaction-tab-count">{total.toLocaleString("vi-VN")}</span></Link>
    <Link href={`/admin?${pendingParams}`} scroll={false} className={isPending?"selected":""} aria-current={isPending?"page":undefined}>Chưa phân loại <span className="transaction-tab-count">{pending.toLocaleString("vi-VN")}</span></Link>
    {selected && <Link href={`/admin?${base}&fund=${encodeURIComponent(selected.id)}`} scroll={false} className="selected transaction-selected-fund" aria-current="page" title={selected.name}>{selected.code}<span className="transaction-tab-count">{selectedCount.toLocaleString("vi-VN")}</span><span className="transaction-selected-fund-name">{selected.name}</span></Link>}
    <Modal title="Chọn thiện pháp để xem giao dịch" footerNote="Chọn một thiện pháp để mở danh sách giao dịch đã gán." wide trigger={<>Xem thêm <ChevronDown size={14} /></>} triggerClassName="button subtle transaction-more-tabs">
      <FundChoices funds={funds} base={base} selected={selectedFund} />
    </Modal>
  </nav>;
}
