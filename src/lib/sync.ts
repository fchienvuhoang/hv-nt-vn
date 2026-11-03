import {prepareBankPage} from "./bank-ingest-cache";
import {enqueueSyncFailure} from "./admin-push";
import {effectiveSyncStart} from "./sync-boundary";
import "server-only";
import { actorStamp, type Actor } from "./actor";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { localDate, parseSourceTime } from "./domain";
import { fetchSourcePage } from "./source";
import { serializable } from "./ledger";
import { ingestBankPage } from "./ingest-bank";
export class SyncBusy extends Error {}
export async function synchronize(actor: Actor) {
  const token = randomUUID();
  const acquired = await db.$executeRaw`
    INSERT INTO "SyncLease" (id, token, "expiresAt") VALUES ('bank-sync', ${token}, (NOW() AT TIME ZONE 'UTC') + INTERVAL '120 seconds')
    ON CONFLICT (id) DO UPDATE SET token = EXCLUDED.token, "expiresAt" = EXCLUDED."expiresAt"
    WHERE "SyncLease"."expiresAt" < (NOW() AT TIME ZONE 'UTC')`;
  if (!acquired) throw new SyncBusy("Một lượt đồng bộ khác đang chạy");
  const run = await db.syncRun.create({ data: { status: "RUNNING", ...actorStamp(actor) } });
  let pages = 0,
    inserted = 0,
    updated = 0;
  const maxPages = Math.max(
    1,
    Math.min(30, Number(process.env.SYNC_MAX_PAGES) || 8),
  );
  const deadline =
    Date.now() +
    Math.max(
      15000,
      Math.min(45000, Number(process.env.SYNC_BUDGET_MS) || 45000),
    );
  let pending = false;
  try {
    const configured = await db.bankAccount.findMany({
      orderBy: { number: "asc" },
    });
    if (!configured.length) throw new Error("Chưa có tài khoản sao kê");
    const accounts = [];
    for (const account of configured) {
      const syncFrom =
        effectiveSyncStart(account.syncFrom??account.cutoverAt);
      if (account.syncFrom?.getTime()!==syncFrom.getTime())
        await db.bankAccount.update({
          where: { id: account.id },
          data: { syncFrom },
        });
      accounts.push({ ...account, syncFrom });
    }
    // Each stream gets a page per round, so a large history cannot starve another account.
    const streams = accounts.flatMap((account) =>
      (["CREDIT", "DEBIT"] as const).map((direction) => ({
        account,
        direction,
        done: false,
      })),
    );
    while (
      streams.some((s) => !s.done) &&
      pages < maxPages &&
      Date.now() < deadline - 7000
    ) {
      for (const stream of streams) {
        if (stream.done) continue;
        if (pages >= maxPages || Date.now() >= deadline - 7000) {
          pending = true;
          break;
        }
        const { account, direction } = stream;
        const state = await db.syncState.upsert({
          where: { accountId_direction: { accountId: account.id, direction } },
          create: { accountId: account.id, direction },
          update: {},
        });
        const originalFrom =
          state.windowFrom ??
          localDate(
            new Date(
              Math.max(
                account.syncFrom.getTime(),
                (state.completedTo?.getTime() ?? account.syncFrom.getTime()) -
                  2 * 86400000,
              ),
            ),
          );
        const from=originalFrom<localDate(account.syncFrom)?localDate(account.syncFrom):originalFrom;
        const staleWindow=from!==originalFrom;
        const to=staleWindow?localDate():(state.windowTo??localDate());
        const page=state.windowFrom&&!staleWindow?state.nextPage:1;
        // Freeze the window before the first source request, so errors resume the same window.
        if (!state.windowFrom||staleWindow)
          await db.syncState.update({
            where: { id: state.id },
            data: { windowFrom: from, windowTo: to, nextPage: 1 },
          });
        const result = await fetchSourcePage(
          account.number,
          direction,
          from,
          to,
          page,
          Math.max(1000, Math.min(12000, deadline - Date.now() - 5000)),
        );
        if (
          result.total > 0 &&
          page <= Math.ceil(result.total / 100) &&
          result.items.length === 0
        )
          throw new Error(
            "Nguồn trả trang rỗng trước khi hết dữ liệu; giữ tiến độ để thử lại",
          );
        const items = [...new Map(result.items.map(i=>[i.id,i])).values()].filter(i=>parseSourceTime(i.transactionTime)>=account.syncFrom);
        // Explicit reconciliation reads Postgres, then warms the quick-poll cache after commit.
        const prepared=await prepareBankPage(account.id,items,{useCache:false});
        const lastPage = page >= Math.ceil(result.total / 100);
        const outcome = await serializable(async (tx) => {
          const lease = await tx.syncLease.updateMany({
            where: { id: "bank-sync", token, expiresAt: { gt: new Date() } },
            data: { expiresAt: new Date(Date.now() + 120000) },
          });
          if (!lease.count)
            throw new Error(
              "Lượt đồng bộ đã hết quyền xử lý; sẽ tiếp tục ở lượt sau",
            );
          const ingested = await ingestBankPage(tx, account.id, prepared.items, actor);
          await tx.syncState.update({
            where: { id: state.id },
            data: lastPage
              ? {
                  completedTo: new Date(`${to}T23:59:59+07:00`),
                  windowFrom: null,
                  windowTo: null,
                  nextPage: 1,
                  lastSuccessAt: new Date(),
                }
              : { nextPage: page + 1 },
          });
          return ingested;
        }, deadline);
        await prepared.committed();
        pages++;
        inserted += outcome.inserted;
        updated += outcome.updated;
        if (lastPage) stream.done = true;
      }
    }
    pending = streams.some((s) => !s.done);
    await db.syncRun.update({
      where: { id: run.id },
      data: {
        status: pending ? "PARTIAL" : "SUCCESS",
        pages,
        inserted,
        updated,
        finishedAt: new Date(),
      },
    });
    return { runId: run.id, pages, inserted, updated, pending };
  } catch (error) {
    await db.syncRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        pages,
        inserted,
        updated,
        error:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Đồng bộ thất bại",
        finishedAt: new Date(),
      },
    });
    await enqueueSyncFailure();
    throw error;
  } finally {
    await db.syncLease.deleteMany({ where: { id: "bank-sync", token } });
  }
}
