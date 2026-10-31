import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import AdminWorkspace from "@/components/admin/admin-workspace";
export default async function AdminPage(){
  await requireAdmin();
  return <Suspense fallback={<div role="status">Đang mở không gian quản trị…</div>}><AdminWorkspace/></Suspense>;
}
