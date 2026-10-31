import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { serializable } from "./ledger";
import { localDate, startOfVietnamDay, parseSourceTime } from "./domain";
import { dueSyncSlots } from "./sync-schedule";
import { fetchSourcePage } from "./source";
import { ingestBankPage } from "./ingest-bank";
import type { Prisma } from "@/generated/prisma/client";
type Progress = { accountId: string; number: string; direction: "CREDIT" | "DEBIT"; page: number; done: boolean }[];

/** One authorized external call; skipped and interrupted calls remain observable. */
export async function scheduledSync(now = new Date()) {
  const invocation = await db.syncInvocation.create({ data: { receivedAt: now } });
  const token = randomUUID();
  let acquired = false;
  let quickPages = 0, fullPages = 0, inserted = 0, updated = 0;
  const jobIds: string[] = [];
  const deadline = Date.now() + Math.max(15000, Math.min(45000, Number(process.env.SYNC_BUDGET_MS) || 20000));
  const maxPages = Math.max(4, Math.min(30, Number(process.env.SYNC_MAX_PAGES) || 8));
  try {
    acquired = !!(await db.$executeRaw`INSERT INTO "SyncLease" (id,token,"expiresAt") VALUES ('bank-sync',${token},(NOW() AT TIME ZONE 'UTC') + INTERVAL '120 seconds') ON CONFLICT (id) DO UPDATE SET token=EXCLUDED.token,"expiresAt"=EXCLUDED."expiresAt" WHERE "SyncLease"."expiresAt" < (NOW() AT TIME ZONE 'UTC')`);
    if (!acquired) {
      await db.syncInvocation.update({ where: { id: invocation.id }, data: { status: "SKIPPED", finishedAt: new Date() } });
      return { invocationId: invocation.id, skipped: true, reason: "Đang có lượt đồng bộ chạy" };
    }
    const accounts = await db.bankAccount.findMany({ orderBy: { number: "asc" }, include: { syncStates: { select: { completedTo: true, direction: true } } } });
    if (!accounts.length) throw new Error("Chưa có tài khoản sao kê");
    const today = localDate(now);
    for (const account of accounts) {
      if (!account.syncFrom) {
        account.syncFrom = account.cutoverAt ?? startOfVietnamDay(today);
        await db.bankAccount.update({ where: { id: account.id }, data: { syncFrom: account.syncFrom } });
      }
    }
    const progress: Progress = accounts.flatMap(a => (["CREDIT", "DEBIT"] as const).map(direction => ({ accountId: a.id, number: a.number, direction, page: 1, done: false })));
    for (const slot of dueSyncSlots(now)) {
      await db.syncJob.upsert({ where: { slotKey: slot.slotKey }, create: { ...slot, progress }, update: {} });
    }
    // Preserve configured historical synchronization, separately from small live scans.
    const yesterday = localDate(new Date(startOfVietnamDay(today).getTime() - 86400000));
    for (const account of accounts) {
      const configuredFrom = account.syncFrom ?? account.cutoverAt;
      const completed = account.syncStates.length === 2 && account.syncStates.every(s => s.completedTo)
        ? Math.min(...account.syncStates.map(s => s.completedTo!.getTime())) : null;
      const from = configuredFrom && completed !== null ? new Date(Math.max(configuredFrom.getTime(), completed)) : configuredFrom;
      if (!from || localDate(from) >= today) continue;
      const covered = account.syncStates.length === 2 && account.syncStates.every(s => s.completedTo && s.completedTo >= startOfVietnamDay(today));
      if (covered) continue;
      await db.syncJob.upsert({ where: { slotKey: `HISTORY:${account.id}:${localDate(from)}:${yesterday}` },
        create: { slotKey: `HISTORY:${account.id}:${localDate(from)}:${yesterday}`, kind: "HISTORY", targetDate: localDate(from), rangeTo: yesterday, scheduledAt: now, progress: progress.filter(s => s.accountId === account.id) }, update: {} });
    }
    // Persist unfinished quick scans across calls, rather than losing a busy minute.
    let quick = await db.syncJob.findFirst({ where: { kind: "QUICK", status: { in: ["QUEUED", "RUNNING", "PARTIAL", "FAILED"] } }, orderBy: { scheduledAt: "asc" } });
    if (!quick) quick = await db.syncJob.create({ data: { slotKey: `QUICK:${invocation.id}`, kind: "QUICK", targetDate: today, scheduledAt: now, progress } });
    let full = await db.syncJob.findFirst({ where: { kind: { in: ["FULL_DAY", "PREVIOUS_DAY"] }, status: { in: ["QUEUED", "RUNNING", "PARTIAL", "FAILED"] } }, orderBy: { scheduledAt: "asc" } });
    if (!full) full = await db.syncJob.findFirst({ where: { kind: "HISTORY", status: { in: ["QUEUED", "RUNNING", "PARTIAL", "FAILED"] } }, orderBy: { scheduledAt: "asc" } });
    // A full-day batch gets a turn every other call if quick work is backlogged.
    // This prevents reconciliation starvation on slow upstream responses.
    const fullFirst = full && Math.floor(now.getTime() / 60000) % 2 === 0;
    const queue = fullFirst ? [full, quick] : [quick, full];
    for (const job of queue) {
      if (!job || Date.now() >= deadline - 6000 || quickPages + fullPages >= maxPages) continue;
      jobIds.push(job.id);
      await db.syncInvocation.update({ where: { id: invocation.id }, data: { jobIds } });
      const work = job.progress as unknown as Progress;
      await db.syncJob.update({ where: { id: job.id }, data: { status: "RUNNING", startedAt: job.startedAt ?? new Date(), lastCalledAt: new Date(), calls: { increment: 1 }, error: null } });
      const pageSize = job.kind === "QUICK" ? 20 : 100;
      // One round per job per call: all accounts/directions get equal opportunity.
      // Rotate unfinished streams so a small time budget cannot starve stream 4.
      const ordered = [...work.filter(s => !s.done)].sort((a,b) => a.page - b.page);
      for (const stream of ordered) {
        if (Date.now() >= deadline - 6000 || quickPages + fullPages >= maxPages) break;
        const account = accounts.find(a => a.id === stream.accountId);
        if (!account) { stream.done = true; continue; }
        const syncFrom = account.syncFrom ?? account.cutoverAt ?? startOfVietnamDay(today);
        if (localDate(syncFrom) > job.targetDate) { stream.done = true; continue; }
        const page = stream.page;
        const result = await fetchSourcePage(stream.number, stream.direction, job.targetDate, job.rangeTo ?? job.targetDate, page, Math.max(1000, Math.min(10000, deadline - Date.now() - 5000)), pageSize);
        if (result.total > 0 && page <= Math.ceil(result.total / pageSize) && !result.items.length) throw new Error("Nguồn trả trang rỗng trước khi hết dữ liệu");
        const items = [...new Map(result.items.map(i => [i.id, i])).values()].filter(i => parseSourceTime(i.transactionTime) >= syncFrom && localDate(parseSourceTime(i.transactionTime)) >= job.targetDate && localDate(parseSourceTime(i.transactionTime)) <= (job.rangeTo ?? job.targetDate));
        const known = job.kind === "QUICK" && items.length > 0 ? await db.bankTransaction.count({ where: { accountId: account.id, sourceId: { in: items.map(i => i.id) } } }) : 0;
        // Quick scans may stop at a fully-known page; whole-day scans NEVER do.
        const done = page >= Math.ceil(result.total / pageSize) || (job.kind === "QUICK" && known === items.length && items.length > 0);
        const previous = { page: stream.page, done: stream.done };
        stream.page++; stream.done = done;
        try {
          const outcome = await serializable(async tx => {
            const lease = await tx.syncLease.updateMany({ where: { id: "bank-sync", token, expiresAt: { gt: new Date() } }, data: { expiresAt: new Date(Date.now() + 120000) } });
            if (!lease.count) throw new Error("Lượt đồng bộ đã hết quyền xử lý");
            const saved = await ingestBankPage(tx, account.id, items, "scheduler");
            await tx.syncJob.update({ where: { id: job.id }, data: { progress: work as unknown as Prisma.InputJsonValue, pages: { increment: 1 }, inserted: { increment: saved.inserted }, updated: { increment: saved.updated } } });
            // Recency for today reflects complete quick passes, not old-day audits.
            if (done && job.targetDate === today) await tx.syncState.upsert({ where: { accountId_direction: { accountId: account.id, direction: stream.direction } }, create: { accountId: account.id, direction: stream.direction, lastSuccessAt: new Date() }, update: { lastSuccessAt: new Date() } });
            if (done && job.kind === "HISTORY") await tx.syncState.upsert({ where: { accountId_direction: { accountId: account.id, direction: stream.direction } }, create: { accountId: account.id, direction: stream.direction, completedTo: new Date(startOfVietnamDay(job.rangeTo ?? job.targetDate).getTime() + 86400000) }, update: { completedTo: new Date(startOfVietnamDay(job.rangeTo ?? job.targetDate).getTime() + 86400000) } });
            return saved;
          }, deadline);
          if (job.kind === "QUICK") quickPages++; else fullPages++;
          inserted += outcome.inserted; updated += outcome.updated;
          await db.syncInvocation.update({ where: { id: invocation.id }, data: { quickPages, fullPages, inserted, updated } });
        } catch (error) { Object.assign(stream, previous); throw error; }
      }
      const complete = work.every(s => s.done);
      await db.syncJob.update({ where: { id: job.id }, data: { progress: work as unknown as Prisma.InputJsonValue, status: complete ? "SUCCESS" : "PARTIAL", finishedAt: complete ? new Date() : null } });
    }
    const pending = await db.syncJob.count({ where: { status: { in: ["QUEUED", "RUNNING", "PARTIAL", "FAILED"] } } }) > 0;
    await db.syncInvocation.update({ where: { id: invocation.id }, data: { status: pending ? "PARTIAL" : "SUCCESS", quickPages, fullPages, inserted, updated, finishedAt: new Date() } });
    return { invocationId: invocation.id, quickPages, fullPages, inserted, updated, pending };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0,500) : "Đồng bộ thất bại";
    await db.syncInvocation.update({ where: { id: invocation.id }, data: { status: "FAILED", quickPages, fullPages, inserted, updated, error: message, finishedAt: new Date() } });
    // Preserve cursor; retry the unfinished batch on the next valid webhook.
    if (jobIds.length) await db.syncJob.updateMany({ where: { id: jobIds.at(-1), status: "RUNNING" }, data: { status: "FAILED", error: message } });
    throw error;
  } finally {
    if (acquired) await db.syncLease.deleteMany({ where: { id: "bank-sync", token } });
  }
}
