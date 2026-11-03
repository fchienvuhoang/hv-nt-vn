import {measureOperations} from "./operation-metrics";
import {saveSyncEvent} from "./sync-events";
import type {SyncInvocation} from "@/generated/prisma/client";
import {prepareBankPage} from "./bank-ingest-cache";
import {enqueueSyncFailure} from "./admin-push";
import {BANK_SYNC_MIN_DATE,effectiveSyncStart} from "./sync-boundary";
import "server-only";
import { refreshSourceBalances } from "./source-balance-sync";
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
export async function scheduledSync(now = new Date()) {return measureOperations("bank-sync",()=>runScheduledSync(now));}
async function runScheduledSync(now:Date) {
  const invocation:SyncInvocation = {id:randomUUID(),receivedAt:now,finishedAt:null,status:"RECEIVED",quickPages:0,fullPages:0,inserted:0,updated:0,jobIds:[],error:null};
  const token = randomUUID();
  let acquired = false;
  let quickPages = 0, fullPages = 0, inserted = 0, updated = 0;
  const jobIds: string[] = [];
  const affectedFundIds=new Set<string>();
  const deadline = Date.now() + Math.max(15000, Math.min(45000, Number(process.env.SYNC_BUDGET_MS) || 20000));
  const maxPages = Math.max(4, Math.min(30, Number(process.env.SYNC_MAX_PAGES) || 8));
  try {
    acquired = !!(await db.$executeRaw`INSERT INTO "SyncLease" (id,token,"expiresAt") VALUES ('bank-sync',${token},(NOW() AT TIME ZONE 'UTC') + INTERVAL '120 seconds') ON CONFLICT (id) DO UPDATE SET token=EXCLUDED.token,"expiresAt"=EXCLUDED."expiresAt" WHERE "SyncLease"."expiresAt" < (NOW() AT TIME ZONE 'UTC')`);
    if (!acquired) {
      Object.assign(invocation,{status:"SKIPPED",finishedAt:new Date()});
      return { invocationId: invocation.id, skipped: true, reason: "Đang có lượt đồng bộ chạy" };
    }
    const accounts = await db.bankAccount.findMany({ orderBy: { number: "asc" }, include: { syncStates: { select: { completedTo: true, direction: true } } } });
    if (!accounts.length) throw new Error("Chưa có tài khoản sao kê");
    const balances = await refreshSourceBalances(accounts,now);
    const today = localDate(now);
    for (const account of accounts) {
      const syncFrom=effectiveSyncStart(account.syncFrom??account.cutoverAt);
      if(account.syncFrom?.getTime()!==syncFrom.getTime())await db.bankAccount.update({where:{id:account.id},data:{syncFrom}});
      account.syncFrom=syncFrom;
    }
    const progress: Progress = accounts.flatMap(a => (["CREDIT", "DEBIT"] as const).map(direction => ({ accountId: a.id, number: a.number, direction, page: 1, done: false })));
    const planned:Prisma.SyncJobCreateManyInput[]=dueSyncSlots(now).map(slot=>({...slot,progress}));
    const yesterday=localDate(new Date(startOfVietnamDay(today).getTime()-86400000));
    for(const account of accounts){
      const configuredFrom=account.syncFrom??account.cutoverAt;
      const completed=account.syncStates.length===2&&account.syncStates.every(s=>s.completedTo)?Math.min(...account.syncStates.map(s=>s.completedTo!.getTime())):null;
      const from=configuredFrom&&completed!==null?new Date(Math.max(configuredFrom.getTime(),completed)):configuredFrom;
      if(!from||localDate(from)>=today||account.syncStates.length===2&&account.syncStates.every(s=>s.completedTo&&s.completedTo>=startOfVietnamDay(today)))continue;
      planned.push({slotKey:`HISTORY:${account.id}:${localDate(from)}:${yesterday}`,kind:"HISTORY",targetDate:localDate(from),rangeTo:yesterday,scheduledAt:now,progress:progress.filter(s=>s.accountId===account.id)});
    }
    const openStatuses=["QUEUED","RUNNING","PARTIAL","FAILED"];
    const jobs=await db.syncJob.findMany({where:{OR:[{status:{in:openStatuses}},{slotKey:{in:planned.map(j=>j.slotKey)}}]},orderBy:[{scheduledAt:"asc"},{id:"asc"}]});
    const obsolete=jobs.filter(j=>openStatuses.includes(j.status)&&(j.rangeTo??j.targetDate)<BANK_SYNC_MIN_DATE);
    if(obsolete.length){await db.syncJob.updateMany({where:{id:{in:obsolete.map(j=>j.id)}},data:{status:"SUPERSEDED",finishedAt:new Date(),error:"Chặn sao kê trước 01/11/2026: dữ liệu lịch sử nhập Excel"}});for(const job of obsolete)job.status="SUPERSEDED"}
    for(const job of jobs.filter(j=>openStatuses.includes(j.status)&&j.targetDate<BANK_SYNC_MIN_DATE)){
      const reset=(job.progress as unknown as Progress).map(stream=>({...stream,page:1,done:false}));
      await db.syncJob.update({where:{id:job.id},data:{targetDate:BANK_SYNC_MIN_DATE,progress:reset}});job.targetDate=BANK_SYNC_MIN_DATE;job.progress=reset;
    }
    const missing=planned.filter(j=>!jobs.some(old=>old.slotKey===j.slotKey));
    if(!jobs.some(j=>j.kind==="QUICK"&&openStatuses.includes(j.status)))missing.push({slotKey:`QUICK:${invocation.id}`,kind:"QUICK",targetDate:today,scheduledAt:now,progress});
    if(missing.length)jobs.push(...await db.syncJob.createManyAndReturn({data:missing,skipDuplicates:true}));
    const queued=jobs.filter(j=>openStatuses.includes(j.status)).sort((a,b)=>a.scheduledAt.getTime()-b.scheduledAt.getTime()||a.id.localeCompare(b.id));
    const quick=queued.find(j=>j.kind==="QUICK"),full=queued.find(j=>["FULL_DAY","PREVIOUS_DAY"].includes(j.kind))??queued.find(j=>j.kind==="HISTORY");
    // A full-day batch gets a turn every other call if quick work is backlogged.
    // This prevents reconciliation starvation on slow upstream responses.
    const fullFirst = full && Math.floor(now.getTime() / 60000) % 2 === 0;
    const queue = fullFirst ? [full, quick] : [quick, full];
    for (const job of queue) {
      if (!job || Date.now() >= deadline - 6000 || quickPages + fullPages >= maxPages) continue;
      jobIds.push(job.id);
      invocation.jobIds=[...jobIds];
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
        const syncFrom = effectiveSyncStart(account.syncFrom??account.cutoverAt);
        if (localDate(syncFrom) > (job.rangeTo??job.targetDate)) { stream.done = true; continue; }
        const from=localDate(syncFrom)>job.targetDate?localDate(syncFrom):job.targetDate;
        const page = stream.page;
        const result = await fetchSourcePage(stream.number, stream.direction, from, job.rangeTo ?? job.targetDate, page, Math.max(1000, Math.min(10000, deadline - Date.now() - 5000)), pageSize);
        if (result.total > 0 && page <= Math.ceil(result.total / pageSize) && !result.items.length) throw new Error("Nguồn trả trang rỗng trước khi hết dữ liệu");
        const items = [...new Map(result.items.map(i => [i.id, i])).values()].filter(i => parseSourceTime(i.transactionTime) >= syncFrom && localDate(parseSourceTime(i.transactionTime)) >= job.targetDate && localDate(parseSourceTime(i.transactionTime)) <= (job.rangeTo ?? job.targetDate));
        const prepared=await prepareBankPage(account.id,items,{useCache:job.kind==="QUICK",now:now.getTime()});
        const previous={page:stream.page,done:stream.done};
        try {
          const outcome = await serializable(async tx => {
            const saved = await ingestBankPage(tx, account.id, prepared.items, "scheduler");
            saved.knownCount+=prepared.knownCount;
            // Reuse the ingest lookup; hash changes are still ingested before a quick stop.
            const done=page>=Math.ceil(result.total/pageSize)||(job.kind==="QUICK"&&items.length>0&&saved.knownCount===items.length);
            stream.page=page+1;stream.done=done;
            const successAt=done&&job.targetDate===today?new Date():null;
            const completedTo=done&&job.kind==="HISTORY"?new Date(startOfVietnamDay(job.rangeTo??job.targetDate).getTime()+86400000):null;
            // Validate/renew the lease, persist the cursor/counters and touch recency
            // together. A lost lease rolls back ALL ingested money in this transaction.
            const recorded=await tx.$queryRaw<{count:number}[]>`
              WITH lease_saved AS (
                UPDATE "SyncLease" SET "expiresAt"=${new Date(Date.now()+120000)}
                WHERE id='bank-sync' AND token=${token} AND "expiresAt">${new Date()} RETURNING id
              ), job_saved AS (
                UPDATE "SyncJob" AS j SET progress=${JSON.stringify(work)}::jsonb,
                  pages=j.pages+1, inserted=j.inserted+${saved.inserted}, updated=j.updated+${saved.updated}
                WHERE j.id=${job.id} AND EXISTS(SELECT 1 FROM lease_saved) RETURNING j.id
              ), state_saved AS (
                INSERT INTO "SyncState" (id,"accountId",direction,"nextPage","lastSuccessAt","completedTo")
                SELECT ${randomUUID()},${account.id},${stream.direction}::"Direction",1,${successAt}::timestamp,${completedTo}::timestamp
                WHERE ${!!successAt||!!completedTo} AND EXISTS(SELECT 1 FROM job_saved)
                ON CONFLICT ("accountId",direction) DO UPDATE SET
                  "lastSuccessAt"=COALESCE(EXCLUDED."lastSuccessAt","SyncState"."lastSuccessAt"),
                  "completedTo"=COALESCE(EXCLUDED."completedTo","SyncState"."completedTo")
                RETURNING id
              )
              SELECT count(*)::int FROM job_saved`;
            if(recorded[0]?.count!==1)throw new Error("Lượt đồng bộ đã hết quyền xử lý hoặc không lưu được tiến độ đồng bộ");
            return saved;
          }, deadline);
          await prepared.committed();
          if (job.kind === "QUICK") quickPages++; else fullPages++;
          inserted += outcome.inserted; updated += outcome.updated;
          for(const id of outcome.affectedFundIds)affectedFundIds.add(id);
        } catch (error) { Object.assign(stream, previous); throw error; }
      }
      const complete = work.every(s => s.done);
      job.status=complete?"SUCCESS":"PARTIAL";
      if(complete&&job.kind==="QUICK")await db.syncJob.delete({where:{id:job.id}});
      else await db.syncJob.update({ where: { id: job.id }, data: { progress: work as unknown as Prisma.InputJsonValue, status: complete ? "SUCCESS" : "PARTIAL", finishedAt: complete ? new Date() : null } });
    }
    const pending = jobs.some(j=>openStatuses.includes(j.status));
    Object.assign(invocation,{status:pending?"PARTIAL":"SUCCESS"});
    return { invocationId: invocation.id, quickPages, fullPages, inserted, updated, pending, balances, affectedFundIds:[...affectedFundIds] };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0,500) : "Đồng bộ thất bại";
    Object.assign(invocation,{status:"FAILED",error:message});
    // Preserve cursor; retry the unfinished batch on the next valid webhook.
    if (jobIds.length) await db.syncJob.updateMany({ where: { id: jobIds.at(-1), status: "RUNNING" }, data: { status: "FAILED", error: message } });
    await enqueueSyncFailure();
    throw Object.assign(error instanceof Error?error:new Error(message),{affectedFundIds:[...affectedFundIds]});
  } finally {
    try {if (acquired) await db.syncLease.deleteMany({ where: { id: "bank-sync", token } });}
    finally {await saveSyncEvent({...invocation,quickPages,fullPages,inserted,updated,finishedAt:new Date()});}
  }
}
