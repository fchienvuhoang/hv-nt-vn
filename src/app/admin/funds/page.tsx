import { redirect } from "next/navigation";
import { adminUrl } from "@/lib/admin-navigation";
export default async function LegacyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
  if (params.edit) {
    params.modal = "edit-fund";
    params.fundId = params.edit;
    delete params.edit;
  }
  redirect(adminUrl("funds", params));
}
