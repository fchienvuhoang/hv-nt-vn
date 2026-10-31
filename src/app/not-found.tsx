import Link from "next/link";
export default function NotFound() {
  return (
    <main className="standalone">
      <div className="eyebrow">HÙN PHƯỚC</div>
      <h1>Chưa tìm thấy thiện pháp</h1>
      <p>Đường dẫn không tồn tại hoặc số liệu chưa được xác nhận công khai.</p>
      <Link className="button primary" href="/login">
        Về trang đăng nhập
      </Link>
    </main>
  );
}
