import { requireAdmin } from "@/lib/auth";
import { signOut } from "@/auth";
import { Brand } from "@/components/ui";
import { AdminNav } from "@/components/admin-nav";
import { ShieldCheck, LogOut } from "lucide-react";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const email = await requireAdmin();
  return <div className="admin-shell"><aside className="sidebar"><Brand/><AdminNav/><div className="sidebar-bottom"><div className="integrity"><ShieldCheck size={20}/><span>Rõ từng khoản hùn<small>Trọn vẹn niềm tin</small></span></div><div className="user"><span className="avatar">{email[0].toUpperCase()}</span><div><strong>Quản trị viên</strong><small title={email}>{email}</small></div><form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}><button className="icon-button" title="Đăng xuất"><LogOut size={17}/></button></form></div></div></aside><div className="admin-body"><header className="topbar"><span>Không gian quản trị <span className="topbar-divider">/</span> <strong>Hùn phước</strong></span><span className="secure"><ShieldCheck size={15}/> Truy cập được bảo vệ</span></header><main className="main-content">{children}</main><footer className="admin-footer">Hùn phước · Đồng hành cùng các thiện pháp<span>Số liệu tính bằng Việt Nam đồng (VND)</span></footer></div></div>;
}
