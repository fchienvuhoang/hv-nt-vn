import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { signOut } from "@/auth";
import { Brand } from "@/components/ui";
import { AdminNav } from "@/components/admin-nav";
import { LogOut, ShieldCheck } from "lucide-react";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const email = await requireAdmin();
  return (
    <div className="admin-workspace">
      <header className="workspace-header">
        <div className="workspace-header-inner">
          <Brand href="/admin" />
          <span className="workspace-label">KHÔNG GIAN QUẢN TRỊ</span>
          <div className="workspace-header-actions">
            <span className="workspace-user" title={email}>
              <span className="avatar">{email[0].toUpperCase()}</span>
              <span>
                Quản trị viên<small>{email}</small>
              </span>
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button
                className="icon-button"
                title="Đăng xuất"
                aria-label="Đăng xuất"
              >
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </div>
        <div className="workspace-nav-wrap">
          <Suspense fallback={<div className="nav-placeholder" />}>
            <AdminNav />
          </Suspense>
          <span className="workspace-secure">
            <ShieldCheck size={13} />
            Phiên đăng nhập an toàn
          </span>
        </div>
      </header>
      <main className="workspace-main">{children}</main>
      <footer className="workspace-footer">
        <span>Hùn phước · Rõ từng khoản hùn, trọn vẹn niềm tin.</span>
        <span>Đơn vị tiền tệ: VND</span>
      </footer>
    </div>
  );
}
