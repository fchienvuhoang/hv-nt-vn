export function goalAchievementKey(fund: { id: string; status: string; goalAmount: bigint | null; income: bigint }) {
  return fund.status === "ACTIVE" && fund.goalAmount !== null && fund.goalAmount > 0n && fund.income >= fund.goalAmount
    ? `fund-goal:${fund.id}:${fund.goalAmount}` : null;
}

export function adminNotificationEmails(value: string) {
  return [...new Set(value.split(",").map(email => email.trim().toLowerCase()).filter(Boolean))];
}

export const GOAL_EMAIL_MILESTONES = [80, 90, 95, 100] as const;
export function goalEmailMilestone(fund: { status: string; goalAmount: bigint | null; income: bigint }, previous = 0) {
  if (fund.status !== "ACTIVE" || !fund.goalAmount || fund.goalAmount <= 0n) return null;
  const highest = [...GOAL_EMAIL_MILESTONES].reverse().find(milestone => fund.income * 100n >= fund.goalAmount! * BigInt(milestone));
  return highest && highest > previous ? highest : null;
}

export function morningReportDate(now: Date, activatedAt: Date) {
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const scheduled = new Date(`${day}T07:00:00+07:00`);
  return now >= scheduled && scheduled >= activatedAt ? day : null;
}
