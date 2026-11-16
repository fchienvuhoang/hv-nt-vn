import { NextResponse } from "next/server";
import { publicFundCatalog } from "@/lib/public-fund-catalog";

export async function GET() {
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
  try {
    return NextResponse.json({ funds: await publicFundCatalog() }, { headers });
  } catch {
    return NextResponse.json({ error: "Chưa tải được danh sách thiện pháp. Vui lòng thử lại." }, { status: 500, headers });
  }
}
