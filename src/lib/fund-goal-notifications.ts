import {measureOperations} from "./operation-metrics";
import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { fundTotals } from "./ledger";
import { enqueuePush, dispatchAdminPushSafely } from "./admin-push";
import { allowedAdmin } from "./admin-allowlist";
import { goalAchievementKey, goalEmailMilestone, adminNotificationEmails, receivesAdminEmail } from "./fund-goal-policy";
import { dispatchMorningReports } from "./morning-report";
import { vnd } from "./domain";
import { brandedEmail } from "./email-template";
import { emailLogoAttachments } from "./email-logo";
import { emailConfigured, sendNotificationEmail } from "./email-service";

export async function enqueueFundGoalNotifications() {
  const emails = adminNotificationEmails(process.env.ADMIN_EMAILS ?? "");
  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('fund-goal-notifications'))`;
    const funds = await fundTotals(tx);
    const previous = await tx.fundGoalAchievement.findMany({ select: { fundId: true, goalAmount: true, milestone: true } });
    const data = funds.flatMap(rawFund => {
      const fund={...rawFund,income:rawFund.fundingIncome};
      const highest = previous.filter(event => event.fundId === fund.id && event.goalAmount === fund.goalAmount).reduce((max, event) => Math.max(max, event.milestone), 0);
      const milestone = goalEmailMilestone(fund, highest);
      const id = milestone === 100 ? goalAchievementKey(fund) : milestone ? `fund-goal:${fund.id}:${fund.goalAmount}:${milestone}` : null;
      return id ? [{ id, milestone: milestone!, fundId: fund.id, goalAmount: fund.goalAmount!, income: fund.income, code: fund.code, name: fund.name, slug: fund.slug }] : [];
    });
    if (!data.length) return;
    // Unique milestone IDs serialize concurrent scans; queue both channels in the same commit.
    const created = await tx.fundGoalAchievement.createManyAndReturn({ data, skipDuplicates: true });
    await enqueuePush(tx, created.filter(event => event.milestone === 100).map(event => ({ key: event.id, kind: "fundGoalReached" })));
    if (created.length && emails.length) await tx.fundGoalEmail.createMany({
      data: created.flatMap(event => emails.map(email => ({ achievementId: event.id, email }))), skipDuplicates: true,
    });
  }, { timeout: 20000 });
}

export async function dispatchFundGoalEmails() {
  if (!emailConfigured()) return;
  if (!await db.fundGoalEmail.findFirst({where:{finishedAt:null,attempts:{lt:6},nextAttemptAt:{lte:new Date()}},select:{id:true}})) return;
  const token = randomUUID();
  const locked = await db.$executeRaw`INSERT INTO "SyncLease" (id,token,"expiresAt") VALUES ('fund-goal-email',${token},(NOW() AT TIME ZONE 'UTC')+INTERVAL '120 seconds') ON CONFLICT (id) DO UPDATE SET token=EXCLUDED.token,"expiresAt"=EXCLUDED."expiresAt" WHERE "SyncLease"."expiresAt" < (NOW() AT TIME ZONE 'UTC')`;
  if (!locked) return;
  try {
    const rows = await db.fundGoalEmail.findMany({ where: { finishedAt: null, attempts: { lt: 6 }, nextAttemptAt: { lte: new Date() } }, include: { achievement: true }, orderBy: { nextAttemptAt: "asc" }, take: 8 });
    const InlinedAttachments = rows.length ? await emailLogoAttachments() : [];
    for (const row of rows) {
      if (!allowedAdmin(row.email) || !receivesAdminEmail(row.email)) {
        await db.fundGoalEmail.update({ where: { id: row.id }, data: { finishedAt: new Date() } });
        continue;
      }
      // Resend retains idempotency keys for 24 hours; stop ambiguous retries before they expire.
      if (row.firstAttemptAt && Date.now() - row.firstAttemptAt.getTime() > 23 * 3600000) {
        await db.fundGoalEmail.update({ where: { id: row.id }, data: { finishedAt: new Date(), lastError: "Đã hết thời hạn gửi lại an toàn" } });
        continue;
      }
      const event = row.achievement;
      const complete = event.milestone === 100;
      const title = complete ? `${event.code} đã thành tựu` : `${event.code} đã đạt mốc ${event.milestone}% mục tiêu`;
      const remaining = event.goalAmount > event.income ? event.goalAmount - event.income : 0n;
      const content = brandedEmail({
        label: complete ? "THIỆN PHÁP THÀNH TỰU" : "THIỆN PHÁP SẮP THÀNH TỰU",
        title,
        paragraphs: [complete ? `Thiện pháp ${event.code} — ${event.name} đã đạt mục tiêu thành tựu. Kính báo quý quản trị viên cùng ghi nhận và hoan hỷ.` : `Thiện pháp ${event.code} — ${event.name} đã đạt mốc ${event.milestone}% mục tiêu. Còn cần hùn phước ${vnd(remaining)} để thành tựu.`],
        metrics: [{ label: "Đã hùn phước khi ghi nhận", value: vnd(event.income) }, { label: "Mục tiêu thành tựu", value: vnd(event.goalAmount) }],
        ...(process.env.AUTH_URL ? { link: { label: "Xem thiện pháp", url: new URL(`/t/${encodeURIComponent(event.slug)}`, process.env.AUTH_URL).href } } : {}),
        note: "Số tiền là số liệu tại thời điểm hệ thống ghi nhận mốc thành tựu.",
      });
      await db.fundGoalEmail.update({ where: { id: row.id }, data: { attempts: { increment: 1 }, firstAttemptAt: row.firstAttemptAt ?? new Date(), nextAttemptAt: new Date(Date.now() + 60000 * 2 ** row.attempts) } });
      try {
        await sendNotificationEmail({ to: row.email, subject: title, ...content, attachments: InlinedAttachments, idempotencyKey: `fund-goal/${row.id}` });
        await db.fundGoalEmail.update({ where: { id: row.id }, data: { finishedAt: new Date(), lastError: null } });
      } catch (error) {
        await db.fundGoalEmail.update({ where: { id: row.id }, data: { lastError: error instanceof Error ? error.message : "Không gửi được email" } });
      }
    }
  } finally {
    await db.syncLease.deleteMany({ where: { id: "fund-goal-email", token } });
  }
}

export async function dispatchAdminNotificationsSafely(options:{checkGoals?:boolean}={}) {return measureOperations("notifications",()=>dispatchMeasuredNotifications(options));}
async function dispatchMeasuredNotifications({checkGoals=true}:{checkGoals?:boolean}={}) {
  try { if(checkGoals)await enqueueFundGoalNotifications(); } catch { console.error("Fund goal notification queue unavailable"); }
  const now=new Date(),day=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Ho_Chi_Minh"}).format(now),scheduled=new Date(`${day}T07:00:00+07:00`);
  const [work]=await db.$queryRaw<{push:boolean;goals:boolean;morning:boolean}[]>`SELECT
    EXISTS(SELECT 1 FROM "AdminPushDelivery" WHERE "finishedAt" IS NULL AND attempts<6 AND "nextAttemptAt"<=${now}) AS push,
    EXISTS(SELECT 1 FROM "FundGoalEmail" WHERE "finishedAt" IS NULL AND attempts<6 AND "nextAttemptAt"<=${now}) AS goals,
    (EXISTS(SELECT 1 FROM "DailyReportEmail" WHERE "finishedAt" IS NULL AND attempts<6 AND "nextAttemptAt"<=${now})
    OR EXISTS(SELECT 1 FROM "DailyReportSchedule" WHERE id='morning-7h' AND "activatedAt"<=${scheduled} AND ${now}>=${scheduled}
    AND NOT EXISTS(SELECT 1 FROM "DailyReport" WHERE date=${day}))) AS morning`;
  await Promise.allSettled([work.push?dispatchAdminPushSafely():Promise.resolve(), work.goals?dispatchFundGoalEmails():Promise.resolve(), work.morning?dispatchMorningReports():Promise.resolve()]);
}
