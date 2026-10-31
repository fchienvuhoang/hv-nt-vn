"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ArrowLeftRight, Sprout, Shuffle, ClipboardCheck, RefreshCw, ExternalLink } from "lucide-react";
const links = [
  { href: "/admin", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/admin/transactions", label: "Giao dịch", icon: ArrowLeftRight },
  { href: "/admin/funds", label: "Thiện pháp", icon: Sprout },
  { href: "/admin/transfers", label: "Điều chuyển", icon: Shuffle },
  { href: "/admin/reconciliation", label: "Đối soát đầu kỳ", icon: ClipboardCheck },
  { href: "/admin/sync", label: "Đồng bộ & lịch sử", icon: RefreshCw },
];
export function AdminNav() {
  const path = usePathname();
  return <nav className="admin-nav" aria-label="Quản trị"><div className="nav-caption">QUẢN LÝ THIỆN PHÁP</div>{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={path === href ? "selected" : ""}><Icon size={19}/>{label}{path === href && <span className="nav-dot"/>}</Link>)}<div className="nav-caption nav-caption-bottom">MINH BẠCH CÙNG CỘNG ĐỒNG</div><Link href="/" target="_blank"><ExternalLink size={18}/>Trang công khai</Link></nav>;
}
