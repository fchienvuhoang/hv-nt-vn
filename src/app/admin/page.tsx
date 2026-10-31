import { LoadingIndicator } from "@/components/loading-indicator";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import AdminWorkspace from "@/components/admin/admin-workspace";
export default async function AdminPage(){
  await requireAdmin();
  return <Suspense fallback={<LoadingIndicator label="Đang mở không gian quản trị…"/>}><AdminWorkspace/></Suspense>;
}
