import Link from "next/link";
import { PublicLink } from "@/components/public-link";
import { AdminLink } from "@/components/admin/admin-link";
import Image from "next/image";
import { ArrowUpRight, Sprout, Check, Pause, Circle } from "lucide-react";
import { vnd } from "@/lib/domain";
export function Brand({
  href = "/login",
  featured = false,
}: {
  href?: string;
  featured?: boolean;
}) {
  const BrandLink=href.startsWith("/admin")?AdminLink:(href==="/minh-bach"||href==="/t"||href.startsWith("/t/"))?PublicLink:Link;
  return (
    <BrandLink href={href} className={`brand${featured ? " brand-featured" : ""}`}>
      <Image
        unoptimized
        src="/branding/hoc-vien-nguyen-thuy-viet-nam.png?v=2"
        alt="Logo Học Viện Nguyên Thủy Việt Nam"
        width={featured ? 112 : 52}
        height={featured ? 112 : 52}
        sizes={featured ? "112px" : "52px"}
        className="academy-logo"
        priority={featured}
      />
      <span>
        Học viện nguyên thủy Việt Nam<small>Minh bạch thiện pháp</small>
      </span>
    </BrandLink>
  );
}
export function Status({ status }: { status: string }) {
  const label =
    status === "ACTIVE"
      ? "Đang hoạt động"
      : status === "PAUSED"
        ? "Tạm dừng"
        : "Hoàn thành";
  const Icon =
    status === "ACTIVE" ? Circle : status === "PAUSED" ? Pause : Check;
  return (
    <span className={`badge ${status.toLowerCase()}`}>
      <Icon size={12} />
      {label}
    </span>
  );
}
export function Heading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export function Metric({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: bigint | string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div className={`metric ${accent ? "metric-dark" : ""}`}>
      <div className="metric-label">
        {label}
        <ArrowUpRight size={17} />
      </div>
      <div className="metric-value">{vnd(value)}</div>
      <div className="metric-note">{note}</div>
    </div>
  );
}
export function Empty({
  title = "Chưa có dữ liệu",
  children,
}: {
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Sprout size={28} />
      <h3>{title}</h3>
      <p>
        {children ??
          "Dữ liệu sẽ xuất hiện sau khi hoàn tất thiết lập và đồng bộ."}
      </p>
    </div>
  );
}
export function Section({
  title,
  note,
  children,
  action,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          {note && <p>{note}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Pagination({
  page,
  total,
  base,
  pageSize = 30,
  itemLabel = "giao dịch",
}: {
  page: number;
  total: number;
  base: string;
  pageSize?: number;
  itemLabel?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(pages, Math.max(1, page));
  const windowStart = Math.min(Math.max(2, current - 3), Math.max(2, pages - 8));
  const visiblePages = pages <= 10
    ? Array.from({ length: pages }, (_, i) => i + 1)
    : [1, ...Array.from({ length: 8 }, (_, i) => windowStart + i), pages];
  const pageHref = (number: number) => {
    const [path, query = ""] = base.split("?");
    const params = new URLSearchParams(query);
    params.set("page", String(number));
    return `${path}?${params}`;
  };
  const PageLink=base.startsWith("/admin")?AdminLink:(base.startsWith("/minh-bach")||base.startsWith("/t?")||base==="/t"||base.startsWith("/t/"))?PublicLink:Link;
  return (
    <div className="pagination">
      <span>
        {total.toLocaleString("vi-VN")} {itemLabel} · Trang {page}/{pages}
      </span>
      <div>
        {page > 1 && (
          <PageLink className="button subtle" href={pageHref(page - 1)}>
            ← Trước
          </PageLink>
        )}
        {visiblePages.map((number, index) => <span className="pagination-page-item" key={number}>
          {index > 0 && number - visiblePages[index - 1] > 1 && <span className="pagination-ellipsis" aria-hidden="true">…</span>}
          <PageLink className={`button subtle pagination-number${number === current ? " selected" : ""}`} href={pageHref(number)} aria-label={`Trang ${number}`} aria-current={number === current ? "page" : undefined}>{number}</PageLink>
        </span>)}
        {page < pages && (
          <PageLink className="button subtle" href={pageHref(page + 1)}>
            Sau →
          </PageLink>
        )}
      </div>
    </div>
  );
}
export function pageNumber(value?: string) {
  return Math.min(100000, Math.max(1, Math.floor(Number(value) || 1)));
}
