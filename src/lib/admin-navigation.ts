export const adminViews = [
  "transactions",
  "funds",
  "statistics",
  "transfers",
  "sync",
] as const;
export type AdminView = (typeof adminViews)[number];
export type AdminParams = Record<string, string | undefined>;
export function getAdminView(value?: string): AdminView {
  return adminViews.includes(value as AdminView)
    ? (value as AdminView)
    : "funds";
}
export function adminUrl(view: AdminView, values: AdminParams = {}) {
  const params = new URLSearchParams();
  if (view !== "funds") params.set("view", view);
  for (const [key, value] of Object.entries(values))
    if (value && key !== "view") params.set(key, value);
  return `/admin${params.size ? `?${params}` : ""}`;
}
