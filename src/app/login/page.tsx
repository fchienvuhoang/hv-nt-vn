import { signIn } from "@/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import {missingAuthVariables} from "@/lib/auth-configuration";
import {cloudflareContext} from "@/lib/cloudflare-context";
import { Brand } from "@/components/ui";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = authErrorMessage(error);
  const missing=missingAuthVariables(process.env);
  const context=cloudflareContext();
  const preview=(context?.env as {HVNTVN_PREVIEW?:string}|undefined)?.HVNTVN_PREVIEW==='1';
  const configured=missing.length===0;
  return (
    <main className="login-page">
      <Brand featured />
      <div className="login-card">
        <div className="eyebrow">KHÔNG GIAN QUẢN TRỊ</div>
        <h1>Chào bạn trở lại.</h1>
        <p>Cùng giữ gìn sự minh bạch trong từng khoản hùn phước.</p>
        {errorMessage && (
          <div role="alert" className="notice danger">
            {errorMessage}
          </div>
        )}
        {configured ? (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/admin" });
            }}
          >
            <button className="button primary full">
              Đăng nhập với Google
            </button>
          </form>
        ) : (
          <div className="notice">
            <strong>Đăng nhập quản trị chưa được cấu hình đầy đủ.</strong>
            <p>Còn thiếu: {missing.join(", ")}.</p>
            <p>{context?preview
              ? "Đây là bản Preview. Thêm các biến còn thiếu trong Settings → Variables and Secrets của Preview này. Previews Base chỉ cung cấp mặc định cho Preview mới."
              : "Thêm các biến còn thiếu trong Worker Settings → Variables and Secrets → Production, rồi deploy lại."
              : "Thêm các biến còn thiếu trong biến môi trường của ứng dụng, rồi deploy lại."}</p>
          </div>
        )}
        <small>Chỉ tài khoản được cấp quyền mới có thể truy cập.</small>
      </div>
      <p className="login-bottom">Rõ từng khoản hùn. Trọn vẹn niềm tin.</p>
    </main>
  );
}
