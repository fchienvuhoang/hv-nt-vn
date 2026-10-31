import "server-only";
import { cache } from "react";
import { auth, allowedAdmin } from "@/auth";
import { redirect } from "next/navigation";
const adminSession=cache(async()=>{
  const session=await auth();
  if (!session?.user?.email || !allowedAdmin(session.user.email)) redirect("/login");
  return session;
});
export async function requireAdmin() {
  const session = await adminSession();
  if (!session?.user?.email || !allowedAdmin(session.user.email)) redirect("/login");
  return session.user.email;
}

export async function requireAdminActor() {
  const session = await adminSession();
  if (!session?.user?.email || !allowedAdmin(session.user.email)) redirect("/login");
  return { id: session.user.id ?? `email:${session.user.email.toLowerCase()}`, name: session.user.name || session.user.email, email: session.user.email };
}
