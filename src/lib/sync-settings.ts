import {BANK_SYNC_MIN_DATE} from "./sync-boundary";
import "server-only";
import { actorStamp, type Actor } from "./actor";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { serializable } from "./ledger";
import { localDate, startOfVietnamDay } from "./domain";
export async function saveSyncStart(
  accountId: string,
  from: string,
  actor: Actor,
) {
  const at = startOfVietnamDay(from);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
    !Number.isFinite(at.getTime()) ||
    localDate(at) !== from ||
    from > localDate()
  )
    throw new Error("Ngày bắt đầu không hợp lệ hoặc ở tương lai");
  if(from<BANK_SYNC_MIN_DATE)throw new Error("Không được đồng bộ trước 01/11/2026; dữ liệu trước mốc này nhập Excel");
  const token = randomUUID();
  const acquired =
    await db.$executeRaw`INSERT INTO "SyncLease" (id,token,"expiresAt") VALUES ('bank-sync',${token},(NOW() AT TIME ZONE 'UTC') + INTERVAL '120 seconds') ON CONFLICT (id) DO UPDATE SET token=EXCLUDED.token,"expiresAt"=EXCLUDED."expiresAt" WHERE "SyncLease"."expiresAt" < (NOW() AT TIME ZONE 'UTC')`;
  if (!acquired)
    throw new Error(
      "Đang đồng bộ. Chờ lượt hiện tại kết thúc rồi đổi ngày bắt đầu",
    );
  try {
    await serializable(async (tx) => {
      const account = await tx.bankAccount.findUniqueOrThrow({
        where: { id: accountId },
      });
      await tx.bankAccount.update({
        where: { id: accountId },
        data: { syncFrom: at },
      });
      await tx.syncState.updateMany({
        where: { accountId },
        data: {
          completedTo: null,
          windowFrom: null,
          windowTo: null,
          nextPage: 1,
          lastSuccessAt: null,
        },
      });
      // Pending windows may refer to the previous start date. Preserve their logs
      // but stop processing them; subsequent calls create fresh cursors.
      await tx.syncJob.updateMany({ where: { status: { in: ["QUEUED", "RUNNING", "PARTIAL", "FAILED"] } }, data: { status: "SUPERSEDED", finishedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          ...actorStamp(actor),
          action: "SYNC_START_UPDATED",
          entityId: accountId,
          details: {
            before: account.syncFrom?.toISOString() ?? null,
            after: at.toISOString(),
            existingTransactionsPreserved: true,
          },
        },
      });
    });
  } finally {
    await db.syncLease.deleteMany({ where: { id: "bank-sync", token } });
  }
}
