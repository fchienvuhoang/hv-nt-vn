/** Only explain public Auth.js error codes; never expose callback details or secrets. */
export function authErrorMessage(error?: string) {
  if (!error) return null;
  switch (error) {
    case "AccessDenied":
      return "Email Google chưa được cấp quyền quản trị hoặc chưa được Google xác minh. Hãy dùng tài khoản có trong ADMIN_EMAILS.";
    case "Configuration":
    case "CallbackRouteError":
    case "OAuthSignin":
    case "OAuthSignInError":
      return "Cấu hình Google SSO chưa hợp lệ. Quản trị viên cần kiểm tra AUTH_GOOGLE_ID và AUTH_GOOGLE_SECRET của cùng một OAuth client, rồi xem nhật ký máy chủ.";
    case "OAuthCallbackError":
    case "OAuthCallback":
    case "InvalidCheck":
      return "Phiên đăng nhập Google không hoàn tất hoặc đã hết hạn. Hãy bắt đầu lại từ nút Đăng nhập với Google; nếu vẫn lỗi, kiểm tra cấu hình OAuth và nhật ký máy chủ.";
    default:
      return "Chưa thể hoàn tất đăng nhập Google. Hãy thử lại; nếu vẫn lỗi, quản trị viên cần kiểm tra nhật ký máy chủ.";
  }
}
