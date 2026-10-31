import {unstable_cache} from "next/cache";
import { auth, allowedAdmin } from "@/auth";
import { syncAccountStatus } from "@/lib/sync-status";
const cachedStatus=unstable_cache(syncAccountStatus,["sync-account-status-v1"],{revalidate:15});
export const dynamic = "force-dynamic";
export async function GET() {
  const session = await auth();
  if (!session?.user?.email || !allowedAdmin(session.user.email))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await cachedStatus(), { headers: { "Cache-Control": "private, no-store" } });
}
