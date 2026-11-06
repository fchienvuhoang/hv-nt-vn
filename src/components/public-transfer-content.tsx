"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

export function PublicTransferContent({ code }: { code: string }) {
  const content = `${code} TÊN SĐT`;
  const [result, setResult] = useState<{ code: string; message: string } | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setResult({ code, message: "Đã sao chép nội dung chuyển khoản." });
    } catch {
      setResult({ code, message: "Chưa sao chép được. Bạn có thể chọn và sao chép nội dung bên trên." });
    }
  }

  return <div className="public-transfer-content">
    <div className="public-transfer-copy">
      <span>Mẫu nội dung chuyển khoản</span>
      <code>{content}</code>
      <button type="button" className="button subtle small" onClick={copy} title="Sao chép nội dung chuyển khoản" aria-label={`Sao chép nội dung chuyển khoản ${content}`}><Copy size={14}/><span>Sao chép</span></button>
    </div>
    <small>Thay TÊN và SĐT bằng tên và số điện thoại của thí chủ. Dùng dấu cách để ngăn cách mã thiện pháp, tên và số điện thoại. Ví dụ: <b>{code} NGUYEN VAN A 0912345678</b>.</small>
    <span role="status">{result?.code === code ? result.message : ""}</span>
  </div>;
}
