import "server-only";
import { db } from "./db";

export async function syncAccountStatus() {
  const accounts = await db.bankAccount.findMany({
    orderBy: { number: "asc" },
    select: {
      id: true, number: true, label: true,
      syncStates: { select: { direction: true, lastSuccessAt: true, windowFrom: true } },
    },
  });
  return formatSyncAccountStatus(accounts);
}
export function formatSyncAccountStatus(accounts:{id:string;number:string;label:string;syncStates:{direction:string;lastSuccessAt:Date|null;windowFrom:string|null}[]}[]){
  const checkedAt = Date.now();
  return accounts.map((account) => {
    const complete = account.syncStates.length === 2 && account.syncStates.every((s) => s.lastSuccessAt);
    return {
      id: account.id, number: account.number, label: account.label, checkedAt,
      // Only claim a complete account sync when both income and expenses succeeded.
      syncedAt: complete ? new Date(Math.min(...account.syncStates.map((s) => s.lastSuccessAt!.getTime()))).toISOString() : null,
      pending: account.syncStates.some((s) => s.windowFrom !== null),
    };
  });
}
export type SyncAccountStatus = ReturnType<typeof formatSyncAccountStatus>;
