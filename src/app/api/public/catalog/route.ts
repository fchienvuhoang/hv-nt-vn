import { NextResponse } from "next/server";
import { publicFundCatalog } from "@/lib/public-fund-catalog";

export async function GET() {
  try {
    return NextResponse.json({ funds: await publicFundCatalog() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Chưa tải được danh sách thiện pháp. Vui lòng thử lại." }, { status: 500 });
  }
}
