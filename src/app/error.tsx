"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="standalone"><h1>Chưa thể tải dữ liệu</h1><p>Vui lòng kiểm tra kết nối cơ sở dữ liệu và cấu hình môi trường, hoặc thử lại sau.</p><button className="button primary" onClick={reset}>Thử lại</button></main>; }
