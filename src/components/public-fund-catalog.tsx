"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Copy, Search, UsersRound } from "lucide-react";
import { Brand, Status } from "@/components/ui";
import { LoadingIndicator } from "@/components/loading-indicator";
import { publicNavigate, usePublicSearch } from "@/components/public-link";
import { normalize } from "@/lib/domain";
import type { PublicFundCatalog } from "@/lib/public-fund-catalog";
import styles from "./public-fund-catalog.module.css";



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
  const q = (params.get("q") ?? "").slice(0, 100);
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
  function navigate(nextQuery: string) {
    const next = new URLSearchParams();
    if (nextQuery.trim()) next.set("q", nextQuery.trim());
    publicNavigate(`${window.location.pathname}${next.size ? `?${next}` : ""}`);
  }
  const terms = normalize(q).split(" ").filter(Boolean);
  const visible = funds?.filter(f => terms.every(term => normalize(`${f.code} ${f.name}`).includes(term))) ?? [];
  const groups = [
    { key: "long", title: "CÁC THIỆN PHÁP DÀI HẠN", rows: visible.filter(f => f.isLongTerm && f.status !== "COMPLETED") },
    { key: "short", title: "CÁC THIỆN PHÁP NGẮN HẠN ĐANG LÀM", rows: visible.filter(f => !f.isLongTerm && f.status !== "COMPLETED") },
    { key: "completed", title: "CÁC THIỆN PHÁP ĐÃ THÀNH TỰU", rows: visible.filter(f => f.status === "COMPLETED") },
  ];
  return <div className="public-site">
    <header className={`public-header ${styles.header}`}><Brand href="/ds-7c9e2a84b6f1" /></header>
    <main className={styles.main}>
      <section className={styles.hero}><span>DANH SÁCH DÀNH CHO QUẢN TRỊ</span><h1>Tổng hợp các thiện pháp</h1><p>Tra cứu, mở và sao chép link sao kê, phương danh thí chủ cổ phần.</p></section>
      <form className={styles.search} role="search" key={q} onSubmit={event => { event.preventDefault(); navigate(String(new FormData(event.currentTarget).get("q") ?? "")); }}>
        <Search size={19} /><input aria-label="Tìm theo mã hoặc tên thiện pháp" name="q" type="search" defaultValue={q} maxLength={100} placeholder="Tìm theo mã hoặc tên thiện pháp…" /><button className="button primary" type="submit">Tìm kiếm</button>
      </form>
      {error ? <div className="notice danger" role="alert">{error} <button className="button subtle" onClick={() => { setError(""); setRetry(n => n + 1); }}>Thử lại</button></div> : !funds ? <LoadingIndicator label="Đang tải danh sách thiện pháp…" /> : <>
        <p className={styles.count}>{visible.length} thiện pháp{q && ` khớp “${q}”`}</p>
        {!visible.length && <p>Không có thiện pháp phù hợp.</p>}
        {groups.map(group => <section className={styles.section} key={group.key} aria-labelledby={`group-${group.key}`}>
          <h2 id={`group-${group.key}`} className={styles.sectionTitle}>{group.title}<span>{group.rows.length}</span></h2>
          {!group.rows.length ? <p className={styles.emptyGroup}>Chưa có thiện pháp{q ? " phù hợp" : ""}.</p> : <div className={styles.list}>{group.rows.map(fund => {
          const path = `/t/${fund.slug}`, recognitionPath = `${path}/phuong-danh`;
          return <article key={fund.slug} className={styles.card}>
            <div className={styles.heading}><span className="code">{fund.code}</span><div className={styles.badges}><Status status={fund.status} /><span className={`${styles.termBadge} ${fund.isLongTerm ? styles.longTerm : ""}`}>{fund.isLongTerm ? "Dài hạn" : "Ngắn hạn"}</span></div></div>
            <h2><a href={path} target="_blank" rel="noopener noreferrer">{fund.name}</a></h2>
            <div className={styles.actions}><div className={styles.group}><a href={path} target="_blank" rel="noopener noreferrer" className={styles.open}>Sao kê <ArrowUpRight size={17} /></a><CopyLink path={path} label={`Sao chép link sao kê ${fund.code}`} /></div>
              {fund.recognitionTitle && <div className={`${styles.group} ${styles.recognition}`}><a href={recognitionPath} target="_blank" rel="noopener noreferrer" className={styles.open} title={`Phương danh ${fund.recognitionTitle}`}><UsersRound size={17} />Phương danh · {fund.recognitionTitle}<ArrowUpRight size={15} /></a><CopyLink path={recognitionPath} label={`Sao chép link phương danh ${fund.code}`} /></div>}
            </div>
          </article>;
        })}</div>}
        </section>)}
      </>}
    </main>
  </div>;
}
