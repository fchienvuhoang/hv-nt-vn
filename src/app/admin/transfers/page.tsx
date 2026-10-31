import { requireAdmin } from "@/lib/auth";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { fundTotals } from "@/lib/ledger";
import { Heading, Section, Empty } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { createTransfer, reverseTransfer } from "../actions";
import { dateTime, vnd } from "@/lib/domain";
export default async function Transfers() {
  await requireAdmin();
  const [funds, transfers] = await Promise.all([fundTotals(), db.transfer.findMany({ include: { fromFund: { include: { account: true } }, toFund: true, reversal: true }, orderBy: { createdAt: "desc" }, take: 100 })]);
  const eligible = funds.filter(f => f.account.finalizedAt);
  return <><Heading eyebrow="SỔ ĐIỀU CHUYỂN NỘI BỘ" title="Điều chuyển giữa các thiện pháp" description="Tiền được chuyển trong cùng tài khoản sao kê. Tổng hùn phước và tổng chi không thay đổi."/>
    <div className="split-grid"><Section title="Tạo khoản điều chuyển" note="Hệ thống kiểm tra cùng tài khoản và số dư trước khi ghi sổ."><ActionForm action={createTransfer} label="Ghi nhận điều chuyển" confirm="Xác nhận điều chuyển số tiền giữa hai thiện pháp?">
      <input type="hidden" name="requestId" value={randomUUID()}/>
      <label>Từ thiện pháp<select name="fromFundId" required defaultValue=""><option value="" disabled>Chọn nguồn tiền</option>{eligible.map(f => <option key={f.id} value={f.id}>{f.account.number} · {f.code} · Còn {vnd(f.balance)}</option>)}</select></label>
      <label>Đến thiện pháp<select name="toFundId" required defaultValue=""><option value="" disabled>Chọn nơi nhận</option>{eligible.map(f => <option key={f.id} value={f.id}>{f.account.number} · {f.code} · {f.name}</option>)}</select></label>
      <label>Số tiền (VND)<input name="amount" type="text" inputMode="numeric" pattern="[0-9]{1,15}" placeholder="2000000" required/></label><label>Lý do điều chuyển<textarea name="reason" rows={3} required minLength={5} maxLength={1000}/></label><div className="notice">Điều chuyển là phân bổ nội bộ, không thực hiện chuyển tiền tại ngân hàng.</div>
    </ActionForm></Section><Section title="Lịch sử điều chuyển" note="100 bút toán gần nhất. Bút toán đã ghi không bị xóa.">{!transfers.length ? <Empty title="Chưa có điều chuyển"/> : <div className="transfer-list">{transfers.map(t => <article key={t.id} className="transfer-row"><div className="row-between"><span className="code">{t.fromFund.code} → {t.toFund.code}</span><strong>{vnd(t.amount)}</strong></div><p>{t.reason}</p><small>{dateTime(t.createdAt)} · TK {t.fromFund.account.number} · {t.actor}</small>{t.reversalOf ? <span className="badge pending">Bút toán đảo</span> : t.reversal ? <span className="badge neutral">Đã đảo</span> : <details><summary>Đảo khoản điều chuyển</summary><ActionForm action={reverseTransfer} label="Tạo bút toán đảo" confirm="Tạo bút toán đảo toàn bộ khoản điều chuyển này?"><input type="hidden" name="transferId" value={t.id}/><label>Lý do đảo<input name="reason" required minLength={5} maxLength={1000}/></label></ActionForm></details>}</article>)}</div>}</Section></div></>;
}
