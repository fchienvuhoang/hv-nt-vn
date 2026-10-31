import Link from "next/link";
import { signIn } from "@/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { Brand } from "@/components/ui";
import { ShieldCheck, ArrowLeft } from "lucide-react";
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const errorMessage = authErrorMessage(error);
  const configured = !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET && !!process.env.AUTH_SECRET && !!process.env.ADMIN_EMAILS;
  return <main className="login-page"><Brand/><div className="login-card"><span className="large-icon"><ShieldCheck size={32}/></span><div className="eyebrow">KHÔNG GIAN QUẢN TRỊ</div><h1>Chào bạn trở lại.</h1><p>Cùng giữ gìn sự minh bạch trong từng khoản hùn phước.</p>{errorMessage && <div role="alert" className="notice danger">{errorMessage}</div>}{configured ? <form action={async () => { "use server"; await signIn("google", { redirectTo: "/admin" }); }}><button className="button primary full">Đăng nhập với Google</button></form> : <div className="notice">SSO chưa được cấu hình. Điền AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET và ADMIN_EMAILS theo README để mở trang quản trị.</div>}<small>Chỉ tài khoản được cấp quyền mới có thể truy cập.</small><Link href="/" className="text-link"><ArrowLeft size={15}/> Xem các thiện pháp công khai</Link></div><p className="login-bottom">Rõ từng khoản hùn. Trọn vẹn niềm tin.</p></main>;
}
