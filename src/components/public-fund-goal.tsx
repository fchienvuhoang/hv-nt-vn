import { readLengthGoal, formatMeasure, fundedLength, remainingLength } from "@/lib/fund-goal";
import { vnd } from "@/lib/domain";

export function PublicFundGoal({ goalAmount, income, goalType, goalConfig }: { goalAmount: string | null; income: string; goalType?: string; goalConfig?: unknown }) {
  if (!goalAmount || BigInt(goalAmount) <= 0n) return null;
  const length = readLengthGoal(goalType, goalConfig);
  const goal = BigInt(goalAmount), raised = BigInt(income);
  const percentage = Number((raised > 0n ? raised : 0n) * 1000n / goal) / 10;
  const remaining = goal > raised ? goal - raised : 0n;
  return <div className="public-fund-goal">
    <div className="public-goal-raised"><span>{length ? "Đã hùn phước (quy đổi)" : "Đã hùn phước"}</span><strong>{length ? `${fundedLength(raised,length)} m` : vnd(income)}</strong></div>
    <div className="public-goal-target"><span>Mục tiêu thành tựu</span><strong>{length ? `${formatMeasure(length.quantity)} m` : vnd(goalAmount)}</strong></div>
    {length&&<small className="public-goal-area-note">Rộng {formatMeasure(length.width)} m · Đơn giá {vnd(length.unitPrice)}/m²<br />Đã hùn phước {vnd(income)} · Tổng mục tiêu {vnd(goalAmount)}</small>}
    <progress max={100} value={Math.min(100, percentage)} aria-label="Tiến độ hùn phước"/>
    <div className="public-goal-summary"><small>{remaining > 0n ? <>Còn cần: <b>{length ? `${remainingLength(raised,length)} m` : vnd(remaining)}</b>{length&&<> · {vnd(remaining)}</>}</> : "Đã đạt mục tiêu thành tựu"}</small><strong>{percentage.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</strong></div>
  </div>;
}
