import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { fundTotals } from "./ledger";
import { enqueuePush, dispatchAdminPushSafely } from "./admin-push";
import { allowedAdmin } from "./admin-allowlist";
import { goalAchievementKey, adminNotificationEmails } from "./fund-goal-policy";
import { vnd } from "./domain";

export async function enqueueFundGoalNotifications() {
  const emails = adminNotificationEmails(process.env.ADMIN_EMAILS ?? "");
  await db.$transaction(async tx => {
    const funds = await fundTotals(tx);
    const data = funds.flatMap(fund => {
      const id = goalAchievementKey(fund);
      return id ? [{ id, fundId: fund.id, goalAmount: fund.goalAmount!, income: fund.income, code: fund.code, name: fund.name, slug: fund.slug }] : [];
    });
    if (!data.length) return;
    // Unique milestone IDs serialize concurrent scans; queue both channels in the same commit.
    const created = await tx.fundGoalAchievement.createManyAndReturn({ data, skipDuplicates: true });
    await enqueuePush(tx, created.map(event => ({ key: event.id, kind: "fundGoalReached" })));
    if (created.length && emails.length) await tx.fundGoalEmail.createMany({
      data: created.flatMap(event => emails.map(email => ({ achievementId: event.id, email }))), skipDuplicates: true,
    });
  }, { timeout: 20000 });
}

export async function dispatchFundGoalEmails() {
  if (!process.env.RESEND_API_KEY || !process.env.NOTIFICATION_EMAIL_FROM || !process.env.AUTH_URL) return;
  const token = randomUUID();
  const locked = await db.$executeRaw`INSERT INTO "SyncLease" (id,token,"expiresAt") VALUES ('fund-goal-email',${token},(NOW() AT TIME ZONE 'UTC')+INTERVAL '120 seconds') ON CONFLICT (id) DO UPDATE SET token=EXCLUDED.token,"expiresAt"=EXCLUDED."expiresAt" WHERE "SyncLease"."expiresAt" < (NOW() AT TIME ZONE 'UTC')`;
  if (!locked) return;
  try {
    const rows = await db.fundGoalEmail.findMany({ where: { finishedAt: null, attempts: { lt: 6 }, nextAttemptAt: { lte: new Date() } }, include: { achievement: true }, orderBy: { nextAttemptAt: "asc" }, take: 8 });
    for (const row of rows) {
      if (!allowedAdmin(row.email)) {
        await db.fundGoalEmail.update({ where: { id: row.id }, data: { finishedAt: new Date() } });
        continue;
      }
      // Resend retains idempotency keys for 24h. Stop ambiguous retries before that window expires.
      if (row.firstAttemptAt && Date.now() - row.firstAttemptAt.getTime() > 23 * 3600000) {
        await db.fundGoalEmail.update({ where: { id: row.id }, data: { finishedAt: new Date(), lastError: "Đã hết thời hạn gửi lại an toàn" } });
        continue;
      }
      const event = row.achievement;
      await db.fundGoalEmail.update({ where: { id: row.id }, data: { attempts: { increment: 1 }, firstAttemptAt: row.firstAttemptAt ?? new Date(), nextAttemptAt: new Date(Date.now() + 60000 * 2 ** row.attempts) } });
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST", signal: AbortSignal.timeout(8000),
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `fund-goal/${row.id}` },
          body: JSON.stringify({ from: process.env.NOTIFICATION_EMAIL_FROM, to: [row.email], subject: `${event.code} đã thành tựu`, text: `Thiện pháp ${event.code} — ${event.name} đã đạt mục tiêu thành tựu.\n\nMục tiêu: ${vnd(event.goalAmount)}\nTổng hùn phước khi ghi nhận: ${vnd(event.income)}\n\nXem thiện pháp: ${new URL(`/t/${encodeURIComponent(event.slug)}`, process.env.AUTH_URL).href}` }),
        });
        if (!response.ok) throw new Error(`Email HTTP ${response.status}`);
        await db.fundGoalEmail.update({ where: { id: row.id }, data: { finishedAt: new Date(), lastError: null } });
      } catch (error) {
        await db.fundGoalEmail.update({ where: { id: row.id }, data: { lastError: error instanceof Error ? error.message : "Không gửi được email" } });
      }
    }
  } finally {
    await db.syncLease.deleteMany({ where: { id: "fund-goal-email", token } });
  }
}

export async function dispatchAdminNotificationsSafely() {
  try { await enqueueFundGoalNotifications(); } catch { console.error("Fund goal notification queue unavailable"); }
  await Promise.allSettled([dispatchAdminPushSafely(), dispatchFundGoalEmails()]);
}
