"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Copy, Search, UsersRound } from "lucide-react";
import { Brand, Status } from "@/components/ui";
import { LoadingIndicator } from "@/components/loading-indicator";
import { publicNavigate, usePublicSearch } from "@/components/public-link";
import { normalize } from "@/lib/domain";
import type { PublicFundCatalog } from "@/lib/public-fund-catalog";
import styles from "./public-fund-catalog.module.css";

const tabs = [["ALL", "Tất cả"], ["ACTIVE", "Đang hoạt động"], ["COMPLETED", "Hoàn thành"], ["PAUSED", "Tạm dừng"]] as const;

function CopyLink({ path, label }: { path: string; label: string }) {
  const [copied, setCopied] = useState(false), [error, setError] = useState(false);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(timer); }, [copied]);
  return <><button type="button" className={styles.icon} title={label} aria-label={label} onClick={async () => {
    try { await navigator.clipboard.writeText(new URL(path, window.location.origin).href); setCopied(true); setError(false); }
    catch { setError(true); }
  }}>{copied ? <Check size={17} /> : <Copy size={17} />}</button><span className={styles.feedback} role="status">{copied ? "Đã sao chép" : error ? "Không sao chép được. Bạn có thể sao chép địa chỉ từ nút mở link." : ""}</span></>;
}

export function PublicFundCatalogView() {
  const search = usePublicSearch(), params = new URLSearchParams(search);
  const q = (params.get("q") ?? "").slice(0, 100), requestedStatus = params.get("status");
  const status = tabs.some(([key]) => key === requestedStatus) ? requestedStatus! : "ALL";
  const [funds, setFunds] = useState<PublicFundCatalog | null>(null), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/ds-7c9e2a84b6f1", { signal: controller.signal, cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không tải được danh sách");
      if (!controller.signal.aborted) setFunds(data.funds);
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Không tải được danh sách"); });
    return () => controller.abort();
  }, [retry]);
  function navigate(nextStatus: string, nextQuery: string) {
    const next = new URLSearchParams();
    if (nextStatus !== "ALL") next.set("status", nextStatus);
    if (nextQuery.trim()) next.set("q", nextQuery.trim());
    publicNavigate(`${window.location.pathname}${next.size ? `?${next}` : ""}`);
  }
  const terms = normalize(q).split(" ").filter(Boolean);
  const matching = funds?.filter(f => terms.every(term => normalize(`${f.code} ${f.name}`).includes(term))) ?? [];
  const visible = matching.filter(f => status === "ALL" || f.status === status);
  return <div className="public-site">
    <header className={`public-header ${styles.header}`}><Brand href="/ds-7c9e2a84b6f1" /></header>
    <main className={styles.main}>
      <section className={styles.hero}><span>DANH SÁCH DÀNH CHO QUẢN TRỊ</span><h1>Tổng hợp các thiện pháp</h1><p>Tra cứu, mở và sao chép link sao kê, phương danh thí chủ cổ phần.</p></section>
      <form className={styles.search} role="search" key={q} onSubmit={event => { event.preventDefault(); navigate(status, String(new FormData(event.currentTarget).get("q") ?? "")); }}>
        <Search size={19} /><input aria-label="Tìm theo mã hoặc tên thiện pháp" name="q" type="search" defaultValue={q} maxLength={100} placeholder="Tìm theo mã hoặc tên thiện pháp…" /><button className="button primary" type="submit">Tìm kiếm</button>
      </form>
      <nav className={styles.tabs} aria-label="Trạng thái thiện pháp">{tabs.map(([key, label]) => <button type="button" key={key} aria-pressed={status === key} onClick={() => navigate(key, q)}>{label} <span>{matching.filter(f => key === "ALL" || f.status === key).length}</span></button>)}</nav>
      {error ? <div className="notice danger" role="alert">{error} <button className="button subtle" onClick={() => { setError(""); setRetry(n => n + 1); }}>Thử lại</button></div> : !funds ? <LoadingIndicator label="Đang tải danh sách thiện pháp…" /> : <>
        <p className={styles.count}>{visible.length} thiện pháp{q && ` khớp “${q}”`}</p>
        {!visible.length && <p>Không có thiện pháp phù hợp.</p>}
        <div className={styles.list}>{visible.map(fund => {
          const path = `/t/${fund.slug}`, recognitionPath = `${path}/phuong-danh`;
          return <article key={fund.slug} className={styles.card}>
            <div className={styles.heading}><span className="code">{fund.code}</span><Status status={fund.status} /></div>
            <h2><a href={path} target="_blank" rel="noopener noreferrer">{fund.name}</a></h2>
            <div className={styles.actions}><div className={styles.group}><a href={path} target="_blank" rel="noopener noreferrer" className={styles.open}>Sao kê <ArrowUpRight size={17} /></a><CopyLink path={path} label={`Sao chép link sao kê ${fund.code}`} /></div>
              {fund.recognitionTitle && <div className={`${styles.group} ${styles.recognition}`}><a href={recognitionPath} target="_blank" rel="noopener noreferrer" className={styles.open} title={`Phương danh ${fund.recognitionTitle}`}><UsersRound size={17} />Phương danh · {fund.recognitionTitle}<ArrowUpRight size={15} /></a><CopyLink path={recognitionPath} label={`Sao chép link phương danh ${fund.code}`} /></div>}
            </div>
          </article>;
        })}</div>
      </>}
    </main>
  </div>;
}
