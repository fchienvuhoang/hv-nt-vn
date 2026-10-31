import Link from "next/link";
import { ArrowUpRight, Sprout, Check, Pause, Circle } from "lucide-react";
import { vnd } from "@/lib/domain";
export function Brand({ href = "/login" }: { href?: string }) {
  return (
    <Link href={href} className="brand">
      <span className="brand-icon">
        <Sprout size={25} />
      </span>
      <span>
        Hùn phước<small>MINH BẠCH THIỆN PHÁP</small>
      </span>
    </Link>
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
}: {
  page: number;
  total: number;
  base: string;
}) {
  const pages = Math.max(1, Math.ceil(total / 30));
  return (
    <div className="pagination">
      <span>
        {total.toLocaleString("vi-VN")} giao dịch · Trang {page}/{pages}
      </span>
      <div>
        {page > 1 && (
          <Link className="button subtle" href={`${base}&page=${page - 1}`}>
            ← Trước
          </Link>
        )}
        {page < pages && (
          <Link className="button subtle" href={`${base}&page=${page + 1}`}>
            Sau →
          </Link>
        )}
      </div>
    </div>
  );
}
export function pageNumber(value?: string) {
  return Math.min(100000, Math.max(1, Math.floor(Number(value) || 1)));
}
