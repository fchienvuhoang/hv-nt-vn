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
    <div className="public-transfer-copy">
      <span>Mã thiện pháp / Nội dung CK</span>
      <code>{code}</code>
      <button type="button" className="button subtle small" onClick={copy} title="Sao chép nội dung chuyển khoản" aria-label={`Sao chép nội dung chuyển khoản ${code}`}><Copy size={14}/><span>Sao chép</span></button>
    </div>
    <span role="status">{result?.code === code ? result.message : ""}</span>
  </div>;
}
