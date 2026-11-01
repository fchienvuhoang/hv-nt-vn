"use client";
import { accountLabel } from "@/lib/account-label";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { SyncAccountStatus } from "@/lib/sync-status";
import { dateTime } from "@/lib/domain";
function relativeTime(at: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - new Date(at).getTime()) / 1000));
  if (seconds < 60) return "Vừa xong";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} phút trước`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} giờ trước`;
  return `${Math.floor(seconds / 86400)} ngày trước`;
}
export function SyncRecency({ initial, initialNow }: { initial: SyncAccountStatus; initialNow: number }) {
  const [accounts, setAccounts] = useState(initial);
  const [now, setNow] = useState(initialNow);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let fetching = false;
    async function update() {
      if (document.hidden || fetching) return;
      setNow(Date.now());
      fetching = true;
      try {
        const response = await fetch("/api/sync/status", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Status unavailable");
        const latest: SyncAccountStatus = await response.json();
        if (!controller.signal.aborted) { setAccounts(latest); setUnavailable(false); }
      } catch {
        if (!controller.signal.aborted) setUnavailable(true);
      } finally { fetching = false; }
    }
    const timer = setInterval(update, 60000);
    document.addEventListener("visibilitychange", update);
    return () => { clearInterval(timer); controller.abort(); document.removeEventListener("visibilitychange", update); };
  }, []);
  const displayedAccounts=(initial[0]?.checkedAt??0)>(accounts[0]?.checkedAt??0)?initial:accounts;
  const displayedNow=Math.max(now,initialNow);
  return (
    <div className="sync-recency" aria-label="Đồng bộ gần nhất theo tài khoản">
      <RefreshCw size={12} aria-hidden="true" />
      {displayedAccounts.map((account) => (
        <span key={account.id} title={`${account.label} · ${account.syncedAt ? `Kiểm tra giao dịch mới cả thu và chi: ${dateTime(account.syncedAt)}` : "Chưa hoàn tất cả thu và chi"}${account.pending ? " · Còn dữ liệu đang chờ đồng bộ" : ""}`}>
          TK {accountLabel(account.number)}: <strong>{account.syncedAt ? <time dateTime={account.syncedAt}>{relativeTime(account.syncedAt, displayedNow)}</time> : "Chưa đồng bộ đủ"}</strong>
          {account.pending && <span className="sync-recency-pending"> · chưa quét xong</span>}
        </span>
      ))}
      {unavailable && <span className="sync-recency-pending">Chưa cập nhật được trạng thái</span>}
    </div>
  );
}
