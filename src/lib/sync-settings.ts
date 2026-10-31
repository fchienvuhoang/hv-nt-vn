import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { serializable } from "./ledger";
import { localDate, startOfVietnamDay } from "./domain";
export async function saveSyncStart(
  accountId: string,
  from: string,
  actor: string,
) {
  const at = startOfVietnamDay(from);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
    !Number.isFinite(at.getTime()) ||
    localDate(at) !== from ||
    from > localDate()
  )
    throw new Error("Ngày bắt đầu không hợp lệ hoặc ở tương lai");
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
      await tx.auditLog.create({
        data: {
          actor,
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
