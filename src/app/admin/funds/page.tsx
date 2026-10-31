import { requireAdmin } from "@/lib/auth";
import Link from "next/link";
import { ExternalLink, Pencil } from "lucide-react";
import { db } from "@/lib/db";
import { fundTotals } from "@/lib/ledger";
import { Heading, Section, Status, Empty } from "@/components/ui";
import { vnd } from "@/lib/domain";
import { ActionForm } from "@/components/action-form";
import { saveFund } from "../actions";
export default async function Funds({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireAdmin();
  const { edit } = await searchParams;
  const [accounts, funds] = await Promise.all([db.bankAccount.findMany({ orderBy: { number: "asc" } }), fundTotals()]);
  const selected = funds.find(f => f.id === edit);
  return <><Heading eyebrow="QUẢN LÝ THIỆN PHÁP" title="Gieo duyên lành, giữ rõ từng khoản" description="Mã và từ khóa giúp các khoản hùn phước tìm đúng thiện pháp."/>
    <div className="split-grid"><Section title={selected ? `Chỉnh sửa ${selected.code}` : "Tạo thiện pháp"} note="Chỉ thiện pháp đang hoạt động được tự động nhận giao dịch.">
      <ActionForm key={selected?.id ?? "new"} action={saveFund} label={selected ? "Lưu thiện pháp" : "Tạo thiện pháp"}>
        {selected && <input type="hidden" name="id" value={selected.id}/>}
        <label>Tài khoản sao kê<select name="accountId" defaultValue={selected?.accountId} required>{accounts.map(a => <option key={a.id} value={a.id}>{a.number} · {a.label}</option>)}</select></label>
        <div className="form-row"><label>Mã thiện pháp<input name="code" placeholder="TP112" defaultValue={selected?.code} pattern="[A-Za-z][A-Za-z0-9]{1,29}" required maxLength={30}/></label><label>Trạng thái<select name="status" defaultValue={selected?.status ?? "ACTIVE"}><option value="ACTIVE">Đang hoạt động</option><option value="PAUSED">Tạm dừng</option><option value="COMPLETED">Hoàn thành</option></select></label></div>
        <label>Tên thiện pháp<input name="name" placeholder="Tên đầy đủ của thiện pháp" defaultValue={selected?.name} minLength={3} maxLength={200} required/></label>
        <label>Từ khóa mở rộng<textarea name="keywords" rows={3} defaultValue={selected?.keywords.join("\n")} placeholder={"Mỗi dòng một từ khóa\nCHUA NGAI 10\nTT CHUA NGAI 10"}/><small>Mã thiện pháp được ưu tiên. Khớp nhiều thiện pháp sẽ chờ xử lý tay.</small></label>
        <label>Mô tả công khai<textarea name="description" rows={3} maxLength={3000} defaultValue={selected?.description}/></label>
        {selected && <Link href="/admin/funds" className="text-link">Hủy chỉnh sửa / tạo mới</Link>}
      </ActionForm>
    </Section><Section title={`Danh sách thiện pháp (${funds.length})`} note="Các thay đổi không tự động sửa phân loại đã có.">
      {!funds.length ? <Empty title="Chưa có thiện pháp">Tạo ở biểu mẫu bên cạnh hoặc nhập CSV tại Đối soát đầu kỳ.</Empty> : <div className="fund-management">{funds.map(f => <article className="fund-manage-row" key={f.id}><div className="row-between"><span className="code">{f.code} · {f.account.number}</span><Status status={f.status}/></div><h3>{f.name}</h3><p className="keyword-preview">{f.keywords.length ? f.keywords.join(" · ") : "Chỉ nhận theo mã chính"}</p><div className="row-between"><div><small>Số dư</small><strong className="block">{vnd(f.balance)}</strong></div><div className="inline-actions"><Link className="button subtle small" href={`/admin/funds?edit=${f.id}`}><Pencil size={14}/>Sửa</Link>{f.account.finalizedAt && <Link className="button subtle small" href={`/t/${f.slug}`} target="_blank"><ExternalLink size={14}/>Công khai</Link>}</div></div></article>)}</div>}
    </Section></div></>;
}
