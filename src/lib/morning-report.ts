import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { allowedAdmin } from "./admin-allowlist";
import { adminNotificationEmails, morningReportDate } from "./fund-goal-policy";
import { emailConfigured, sendNotificationEmail } from "./email-service";
import { emailLogoAttachments } from "./email-logo";
import { loadFundReportData } from "./fund-report-data";
import { fundReportEmail } from "./fund-report-email";

/** The existing minute webhook drives this worker; report dates and recipients are durable. */
export async function dispatchMorningReports(now = new Date()) {
  if (!emailConfigured()) return;
  const day=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Ho_Chi_Minh"}).format(now);
  const scheduled=new Date(`${day}T07:00:00+07:00`);
  const [work]=await db.$queryRaw<{needed:boolean}[]>`SELECT
    EXISTS(SELECT 1 FROM "DailyReportEmail" WHERE "finishedAt" IS NULL AND attempts<6 AND "nextAttemptAt"<=${now})
    OR EXISTS(SELECT 1 FROM "DailyReportSchedule" WHERE id='morning-7h' AND "activatedAt"<=${scheduled} AND ${now}>=${scheduled}
      AND NOT EXISTS(SELECT 1 FROM "DailyReport" WHERE date=${day})) AS needed`;
  if(!work.needed)return;
  const token = randomUUID();
  const locked = await db.$executeRaw`INSERT INTO "SyncLease" (id,token,"expiresAt") VALUES ('morning-report',${token},(NOW() AT TIME ZONE 'UTC')+INTERVAL '180 seconds') ON CONFLICT (id) DO UPDATE SET token=EXCLUDED.token,"expiresAt"=EXCLUDED."expiresAt" WHERE "SyncLease"."expiresAt" < (NOW() AT TIME ZONE 'UTC')`;
  if (!locked) return;
  try {
    const schedule = await db.dailyReportSchedule.findUnique({ where: { id: "morning-7h" } });
    const date = schedule ? morningReportDate(now, schedule.activatedAt) : null;
    const recipients = adminNotificationEmails(process.env.ADMIN_EMAILS ?? "");
    if (date && recipients.length && !await db.dailyReport.findUnique({ where: { date }, select: { date: true } })) {
      const content = fundReportEmail({ ...await loadFundReportData(now), automated: true });
      // Save the immutable payload and all recipients together before making external requests.
      await db.$transaction(async tx => {
        const created = await tx.dailyReport.createManyAndReturn({ data: [{ date, subject: content.subject, text: content.TextPart, html: content.HTMLPart }], skipDuplicates: true });
        if (created.length) await tx.dailyReportEmail.createMany({ data: recipients.map(email => ({ reportDate: date, email })), skipDuplicates: true });
      });
    }
    const rows = await db.dailyReportEmail.findMany({ where: { finishedAt: null, attempts: { lt: 6 }, nextAttemptAt: { lte: new Date() } }, include: { report: true }, orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }], take: 8 });
    const attachments = rows.length ? await emailLogoAttachments() : [];
    for (const row of rows) {
      if (!allowedAdmin(row.email)) {
        await db.dailyReportEmail.update({ where: { id: row.id }, data: { finishedAt: new Date(), lastError: "Đã gỡ quyền quản trị" } });
        continue;
      }
      if (row.firstAttemptAt && Date.now() - row.firstAttemptAt.getTime() > 23 * 3600000) {
        await db.dailyReportEmail.update({ where: { id: row.id }, data: { finishedAt: new Date(), lastError: "Đã hết thời hạn gửi lại an toàn" } });
        continue;
      }
      await db.dailyReportEmail.update({ where: { id: row.id }, data: { attempts: { increment: 1 }, firstAttemptAt: row.firstAttemptAt ?? new Date(), nextAttemptAt: new Date(Date.now() + 60000 * 2 ** row.attempts) } });
      try {
        await sendNotificationEmail({ to: row.email, subject: row.report.subject, TextPart: row.report.text, HTMLPart: row.report.html, attachments, idempotencyKey: `morning-report/${row.id}` });
        await db.dailyReportEmail.update({ where: { id: row.id }, data: { finishedAt: new Date(), lastError: null } });
      } catch (error) {
        await db.dailyReportEmail.update({ where: { id: row.id }, data: { lastError: error instanceof Error ? error.message : "Không gửi được báo cáo sáng" } });
      }
    }
  } finally {
    await db.syncLease.deleteMany({ where: { id: "morning-report", token } });
  }
}
