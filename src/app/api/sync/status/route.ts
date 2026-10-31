import { auth, allowedAdmin } from "@/auth";
import { syncAccountStatus } from "@/lib/sync-status";
export const dynamic = "force-dynamic";
export async function GET() {
  const session = await auth();
  if (!session?.user?.email || !allowedAdmin(session.user.email))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await syncAccountStatus(), { headers: { "Cache-Control": "private, no-store" } });
}
