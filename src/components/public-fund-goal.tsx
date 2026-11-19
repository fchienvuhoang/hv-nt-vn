import { readLengthGoal, readPartGoal, formatMeasure, fundedQuantity, remainingQuantity } from "@/lib/fund-goal";
import { vnd } from "@/lib/domain";

export function PublicFundGoal({ goalAmount, income, goalType, goalConfig }: { goalAmount: string | null; income: string; goalType?: string; goalConfig?: unknown }) {
  if (!goalAmount || BigInt(goalAmount) <= 0n) return null;
  const length = readLengthGoal(goalType, goalConfig), parts = readPartGoal(goalType, goalConfig);
  const unitGoal = length ?? parts, unit = parts ? "phần" : "mét";
  const goal = BigInt(goalAmount), raised = BigInt(income);
  const percentage = Number((raised > 0n ? raised : 0n) * 1000n / goal) / 10;
  const remaining = goal > raised ? goal - raised : 0n;
  return <div className={`public-fund-goal${unitGoal ? " public-goal-length" : ""}`}>
    {unitGoal&&<div className="public-goal-unit-price"><span>Hùn phước <b>{parts ? "1 phần" : "1 mét dài"}</b></span><strong>{vnd(unitGoal.unitPrice)}</strong></div>}
    <div className="public-goal-raised"><span>{unitGoal ? "Đã hùn phước (quy đổi)" : "Đã hùn phước"}</span><strong>{unitGoal ? `${fundedQuantity(raised,unitGoal,true)} ${unit} / ${formatMeasure(unitGoal.quantity)} ${unit}` : vnd(income)}</strong></div>
    {!unitGoal&&<div className="public-goal-target"><span>Mục tiêu thành tựu</span><strong>{vnd(goalAmount)}</strong></div>}
    {unitGoal&&<>{length&&<small className="public-goal-area-note">Rộng {formatMeasure(length.width)} m</small>}<div className="public-goal-money-summary"><span>Đã hùn phước<strong>{vnd(income)}</strong></span><span>Tổng mục tiêu<strong>{vnd(goalAmount)}</strong></span></div></>}
    <progress max={100} value={Math.min(100, percentage)} aria-label="Tiến độ hùn phước"/>
    <div className="public-goal-summary"><small>{remaining > 0n ? <>Còn cần: <b>{unitGoal ? `${remainingQuantity(raised,unitGoal,true)} ${unit}` : vnd(remaining)}</b>{unitGoal&&<> · {vnd(remaining)}</>}</> : "Đã đạt mục tiêu thành tựu"}</small><strong>{percentage.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</strong></div>
  </div>;
}
