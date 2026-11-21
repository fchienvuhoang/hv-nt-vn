import { auth, allowedAdmin } from "@/auth";
import {cachedSyncAccountStatus} from '@/lib/sync-metadata-cache';
export const dynamic = "force-dynamic";
export async function GET() {
  const session = await auth();
  if (!session?.user?.email || !allowedAdmin(session.user.email))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await cachedSyncAccountStatus(), { headers: { "Cache-Control": "private, no-store" } });
}
