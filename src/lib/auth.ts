import "server-only";
import { auth, allowedAdmin } from "@/auth";
import { redirect } from "next/navigation";
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email || !allowedAdmin(session.user.email)) redirect("/login");
  return session.user.email;
}
