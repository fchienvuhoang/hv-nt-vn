import { TRANSACTION_SUMMARY_TAG } from "@/lib/transaction-summary";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { PUBLIC_TAG } from "@/lib/public-data";
import { scheduledSync } from "@/lib/scheduled-sync";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const secret = process.env.SYNC_SECRET;
  if (!secret || secret.length < 32) return NextResponse.json({ error: "Chưa cấu hình SYNC_SECRET tối thiểu 32 ký tự" }, { status: 503 });
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await scheduledSync();
    if (!result.skipped) revalidateTag(TRANSACTION_SUMMARY_TAG, { expire: 0 });
    if (result.inserted || result.updated) revalidateTag(PUBLIC_TAG, { expire: 0 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    revalidateTag(TRANSACTION_SUMMARY_TAG, { expire: 0 });
    // A failure may follow committed pages. Busy/no-change calls keep public cache warm.
    revalidateTag(PUBLIC_TAG, { expire: 0 });
    console.error("Bank sync failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Đồng bộ thất bại. Xem nhật ký quản trị." }, { status: 500 });
  }
}
