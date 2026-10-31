import { dateTime } from "@/lib/domain";
export function RecordAuthor({ name, id, at, fallback }: {
  name?: string | null; id?: string | null; at?: Date | string | null; fallback?: string | null;
}) {
  return <div className="record-author" title={id ? `ID: ${id}` : "Chưa lưu ID người thao tác cho dữ liệu cũ"}>
    <span className={name || fallback ? "record-author-name" : "record-author-unknown"}>{name || fallback || "Chưa lưu danh tính"}</span>
    {at && <time dateTime={new Date(at).toISOString()} title={new Date(at).toISOString()}>{dateTime(at)}</time>}
  </div>;
}
