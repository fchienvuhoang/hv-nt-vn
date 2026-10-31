import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { getAdminView, type AdminParams } from "@/lib/admin-navigation";
import Funds from "@/components/admin/views/funds";
import Transactions from "@/components/admin/views/transactions";
import Transfers from "@/components/admin/views/transfers";
import Sync from "@/components/admin/views/sync";
import { AdminDialogs } from "@/components/admin/admin-dialogs";
import Loading from "./loading";
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const raw = await searchParams;
  const params: AdminParams = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const view = getAdminView(params.view);
  let content;
  switch (view) {
    case "funds":
      content = <Funds params={params} />;
      break;
    case "transactions":
      content = <Transactions searchParams={Promise.resolve(params)} />;
      break;
    case "transfers":
      content = <Transfers />;
      break;
    case "sync":
      content = <Sync params={params} />;
      break;
    default:
      content = <Funds params={params} />;
  }
  return (
    <>
      <Suspense
        key={`${view}-${params.page ?? "1"}-${params.account ?? ""}-${params.q ?? ""}`}
        fallback={<Loading />}
      >
        {content}
      </Suspense>
      <AdminDialogs view={view} params={params} />
    </>
  );
}
