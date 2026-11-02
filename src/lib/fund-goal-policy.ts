export function goalAchievementKey(fund: { id: string; status: string; goalAmount: bigint | null; income: bigint }) {
  return fund.status === "ACTIVE" && fund.goalAmount !== null && fund.goalAmount > 0n && fund.income >= fund.goalAmount
    ? `fund-goal:${fund.id}:${fund.goalAmount}` : null;
}

export function adminNotificationEmails(value: string) {
  return [...new Set(value.split(",").map(email => email.trim().toLowerCase()).filter(Boolean))];
}
