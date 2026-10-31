"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeftRight,
  Sprout,
  Shuffle,
  RefreshCw,
} from "lucide-react";
import { adminUrl, getAdminView } from "@/lib/admin-navigation";
const items = [
  { view: "transactions", label: "Giao dịch", icon: ArrowLeftRight },
  { view: "funds", label: "Thiện pháp", icon: Sprout },
  { view: "transfers", label: "Điều chuyển", icon: Shuffle },
  { view: "sync", label: "Đồng bộ & lịch sử", icon: RefreshCw },
] as const;
export function AdminNav() {
  const params = useSearchParams();
  const active = getAdminView(params.get("view") ?? undefined);
  return (
    <nav className="workspace-nav" aria-label="Chức năng quản trị">
      {items.map(({ view, label, icon: Icon }) => (
        <Link
          key={view}
          href={adminUrl(view)}
          scroll={false}
          aria-current={active === view ? "page" : undefined}
          className={active === view ? "selected" : ""}
        >
          <Icon size={17} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
