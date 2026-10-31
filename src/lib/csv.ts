/** RFC4180-style CSV parser. Amounts are integer VND; templates use comma delimiters. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else if (quoted || value === "") quoted = !quoted;
      else throw new Error("CSV có dấu nháy không hợp lệ");
    } else if (!quoted && (c === "," || c === "\n" || c === "\r")) {
      row.push(value.trim()); value = "";
      if (c !== ",") { if (row.some(Boolean)) rows.push(row); row = []; if (c === "\r" && text[i + 1] === "\n") i++; }
    } else value += c;
  }
  if (quoted) throw new Error("CSV thiếu dấu nháy đóng");
  row.push(value.trim()); if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift();
  if (!headers?.length || new Set(headers).size !== headers.length) throw new Error("CSV thiếu tiêu đề hoặc tiêu đề trùng");
  return rows.map((cells, i) => {
    if (cells.length !== headers.length) throw new Error(`Dòng ${i + 2} không đủ cột`);
    return Object.fromEntries(headers.map((key, index) => [key, cells[index]]));
  });
}
