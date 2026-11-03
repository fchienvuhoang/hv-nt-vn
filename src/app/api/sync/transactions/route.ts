import {queuePublicRefresh,refreshPublicSafely} from "@/lib/public-snapshot";
import {after} from "next/server";
import {dispatchAdminNotificationsSafely} from "@/lib/fund-goal-notifications";
import {BANK_SYNC_MIN_DATE,BANK_SYNC_MIN_ISO} from "@/lib/sync-boundary";
import {ADMIN_LEDGER_TAG,PUBLIC_DIRECTORY_TAG,publicFundTag} from "@/lib/cache-tags";
import { TRANSACTION_SUMMARY_TAG } from "@/lib/transaction-summary";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { scheduledSync } from "@/lib/scheduled-sync";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  const secret = process.env.SYNC_SECRET;
  if (!secret || secret.length < 32) return NextResponse.json({ error: "Chưa cấu hình SYNC_SECRET tối thiểu 32 ký tự" }, { status: 503 });
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let ledgerChanged=false,changedFundIds:string[]=[];
  after(async()=>{await Promise.allSettled([dispatchAdminNotificationsSafely({checkGoals:ledgerChanged}),refreshPublicSafely()]);});
  try {
    const result = await scheduledSync();
    ledgerChanged=!!(result.inserted||result.updated);
    changedFundIds=result.affectedFundIds??[];
    if(result.balances?.some(b=>b.persisted))revalidateTag(TRANSACTION_SUMMARY_TAG,{expire:0});
    if(result.inserted||result.updated)revalidateTag(ADMIN_LEDGER_TAG,{expire:0});
    if(result.affectedFundIds?.length){
      await queuePublicRefresh(result.affectedFundIds);
      revalidateTag(PUBLIC_DIRECTORY_TAG,{expire:0});
      // The next REST read must rebuild from committed database data, never serve stale totals.
      for(const id of result.affectedFundIds)revalidateTag(publicFundTag(id),{expire:0});
    }
    return NextResponse.json({ ok: true, minimumSyncDate:BANK_SYNC_MIN_DATE, minimumSyncAt:BANK_SYNC_MIN_ISO, timezone:"Asia/Ho_Chi_Minh", ...result });
  } catch (error) {
    revalidateTag(TRANSACTION_SUMMARY_TAG, { expire: 0 });
    // Only committed affected funds need rebuilding after a partial failure.
    const ids=(error as {affectedFundIds?:string[]})?.affectedFundIds??changedFundIds;
    ledgerChanged=ids.length>0;
    if(ids.length){revalidateTag(ADMIN_LEDGER_TAG,{expire:0});for(const id of ids)revalidateTag(publicFundTag(id),{expire:0});await queuePublicRefresh(ids);}
    console.error("Bank sync failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Đồng bộ thất bại. Xem nhật ký quản trị." }, { status: 500 });
  }
}
