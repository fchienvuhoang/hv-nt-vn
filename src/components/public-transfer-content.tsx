"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

export function PublicTransferContent({ code }: { code: string }) {
  const [result, setResult] = useState<{ code: string; message: string } | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setResult({ code, message: "Đã sao chép nội dung chuyển khoản." });
    } catch {
      setResult({ code, message: "Chưa sao chép được. Bạn có thể chọn và sao chép nội dung bên trên." });
    }
  }

  return <div className="public-transfer-content">
    <div>Mã thiện pháp: <strong>{code}</strong></div>
    <span>Cú pháp chuyển khoản</span>
    <div className="public-transfer-copy">
      <code>{code}</code>
      <button type="button" className="button subtle small" onClick={copy} aria-label={`Sao chép nội dung chuyển khoản ${code}`}><Copy size={14}/>Sao chép</button>
    </div>
    <small>Ghi đúng mã này trong nội dung chuyển khoản để ghi nhận hùn phước vào thiện pháp.</small>
    <span role="status">{result?.code === code ? result.message : ""}</span>
  </div>;
}
