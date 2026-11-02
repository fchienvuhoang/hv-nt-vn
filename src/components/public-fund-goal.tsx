import { vnd } from "@/lib/domain";

export function PublicFundGoal({ goalAmount, income }: { goalAmount: string | null; income: string }) {
  if (!goalAmount || BigInt(goalAmount) <= 0n) return null;
  const goal = BigInt(goalAmount), raised = BigInt(income);
  const percentage = Number((raised > 0n ? raised : 0n) * 1000n / goal) / 10;
  const remaining = goal > raised ? goal - raised : 0n;
  return <div className="public-fund-goal">
    <div className="public-goal-target"><span>Mục tiêu thành tựu</span><strong>{vnd(goalAmount)}</strong></div>
    <div className="public-goal-raised"><span>Đã hùn phước: <b>{vnd(income)}</b></span><strong>{percentage.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</strong></div>
    <progress max={100} value={Math.min(100, percentage)} aria-label="Tiến độ hùn phước"/>
    <small>{remaining > 0n ? <>Còn cần hùn phước: <b>{vnd(remaining)}</b></> : "Đã đạt mục tiêu thành tựu"}</small>
  </div>;
}
