import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import { normalize, localDate, parseSourceTime } from "./domain";
export type ExcelEntry = {
  row: number;
  at: string;
  amount: string;
  direction: "CREDIT" | "DEBIT";
  narrative: string;
  displayName: string;
  refId: string;
  note: string;
};
export type ParsedFundSheet = {
  name: string;
  headerRow: number;
  accountHint: string | null;
  rows: ExcelEntry[];
  skipped: number;
  errors: string[];
  income: string;
  expense: string;
  sourceIncome: string | null;
  sourceExpense: string | null;
};
export function parseVnd(value: string | number): bigint {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error("Số tiền phải là số nguyên VND không âm");
    if (value > 999999999999999) throw new Error("Số tiền tối đa 15 chữ số");
    return BigInt(value);
  }
  const clean = value.replace(/[₫đĐ]/g, "").trim();
  if (!clean) return 0n;
  if (!/^\d+$/.test(clean) && !/^\d{1,3}(?:[.,\s]\d{3})+$/.test(clean))
    throw new Error(`Số tiền không hợp lệ: ${clean.slice(0, 40)}`);
  const parsed = BigInt(clean.replace(/[.,\s]/g, ""));
  if (parsed > 999999999999999n) throw new Error("Số tiền tối đa 15 chữ số");
  return parsed;
}
export function parseExcelTime(value: string): string {
  const raw = value.trim();
  const vi =
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
      raw,
    );
  const standard =
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
      raw,
    );
  const parts = vi
    ? [vi[3], vi[2], vi[1], vi[4], vi[5], vi[6]]
    : standard
      ? standard.slice(1)
      : null;
  if (!parts)
    throw new Error(
      "Thời gian cần dạng YYYY-MM-DD HH:mm hoặc DD/MM/YYYY HH:mm",
    );
  const [y, m, d, h = "00", minute = "00", sec = "00"] = parts;
  if (Number(h) > 23 || Number(minute) > 59 || Number(sec) > 59)
    throw new Error("Giờ không hợp lệ");
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${minute}:${sec}`;
  const time = parseSourceTime(iso);
  if (!Number.isFinite(time.getTime()) || localDate(time) !== iso.slice(0, 10))
    throw new Error("Ngày không hợp lệ");
  return time.toISOString();
}
export function completeRef(narrative: string) {
  return /\bFT\d{10,}\b/i.exec(narrative)?.[0].toUpperCase() ?? "";
}
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date)
    return value.toISOString().slice(0, 19).replace("T", " ");
  if (typeof value === "object") {
    if ("formula" in value || "sharedFormula" in value)
      return cellText((value as { result?: ExcelJS.CellValue }).result ?? null);
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("text" in value) return String(value.text);
    if ("error" in value)
      throw new Error(
        "Ô Excel có lỗi công thức; hãy kiểm tra và xuất lại file",
      );
  }
  return String(value);
}
export function parseFundGrid(
  name: string,
  grid: string[][],
): ParsedFundSheet | null {
  const headerIndex = grid
    .slice(0, 30)
    .findIndex(
      (row) =>
        row.some(
          (v) =>
            normalize(v) === "THOI GIAN" ||
            normalize(v) === "NGAY" ||
            normalize(v) === "NGAY GIAO DICH",
        ) &&
        row.some(
          (v) =>
            normalize(v).includes("TIEN VAO") ||
            normalize(v).includes("TIEN RA"),
        ),
    );
  if (headerIndex < 0) return null;
  const headers = grid[headerIndex].map(normalize);
  const find = (...labels: string[]) =>
    headers.findIndex((h) =>
      labels.some((label) => h === label || h.startsWith(label + " ")),
    );
  const time = find("THOI GIAN", "NGAY GIAO DICH", "NGAY"),
    narrative = find("NOI DUNG", "DIEN GIAI"),
    owner = find("CHU TAI KHOAN", "TEN THI CHU", "THI CHU"),
    out = find("TIEN RA", "CHI"),
    into = find("TIEN VAO", "THU"),
    note = find("GHI CHU"),
    ref = find("MA GIAO DICH", "REFID", "REF ID");
  if (narrative < 0 || (out < 0 && into < 0)) return null;
  const result: ParsedFundSheet = {
    name,
    headerRow: headerIndex + 1,
    accountHint: (() => {
      const text = normalize(name + " " + (grid[0] ?? []).join(" "));
      const my = /\bTK MY\b|HO THI TRA MY/.test(text),
        tram = /\bTK TRAM\b|TRAN THU TRAM/.test(text);
      return my && !tram ? "0572" : tram && !my ? "0856" : null;
    })(),
    rows: [],
    skipped: 0,
    errors: [],
    income: "0",
    expense: "0",
    sourceIncome: null,
    sourceExpense: null,
  };
  let income = 0n,
    expense = 0n;
  for (let i = headerIndex + 1; i < grid.length; i++) {
    const row = grid[i],
      date = (row[time] ?? "").trim(),
      text = (row[narrative] ?? "").trim();
    const amountIn = into < 0 ? "" : (row[into] ?? ""),
      amountOut = out < 0 ? "" : (row[out] ?? "");
    if (!date && !text) {
      // Summary and auxiliary m²/headcount rows are not transactions.
      if (
        i === headerIndex + 1 &&
        result.sourceIncome === null &&
        result.sourceExpense === null &&
        (amountIn || amountOut)
      ) {
        try {
          const a = parseVnd(amountIn),
            b = parseVnd(amountOut);
          if (a > 0n || b > 0n) {
            result.sourceIncome = a.toString();
            result.sourceExpense = b.toString();
          }
        } catch {}
      }
      result.skipped++;
      continue;
    }
    if ((!amountIn && !amountOut) || normalize(date) === "THOI GIAN") {
      result.skipped++;
      continue;
    }
    try {
      const credit = parseVnd(amountIn),
        debit = parseVnd(amountOut);
      if (!credit && !debit) {
        result.skipped++;
        continue;
      }
      if (credit && debit)
        throw new Error("Một dòng có cả tiền vào và tiền ra");
      const at = parseExcelTime(date);
      const direction = credit ? "CREDIT" : "DEBIT";
      if (text.length > 6000) throw new Error("Nội dung quá dài");
      result.rows.push({
        row: i + 1,
        at,
        amount: (credit || debit).toString(),
        direction,
        narrative: text,
        displayName: owner < 0 ? "" : (row[owner] ?? ""),
        refId:
          (ref < 0 ? "" : (row[ref] ?? "")).trim().toUpperCase() ||
          completeRef(text),
        note: note < 0 ? "" : (row[note] ?? ""),
      });
      income += credit;
      expense += debit;
    } catch (error) {
      if (result.errors.length < 100)
        result.errors.push(
          `Dòng ${i + 1}: ${error instanceof Error ? error.message : "Dữ liệu không hợp lệ"}`,
        );
    }
  }
  result.income = income.toString();
  result.expense = expense.toString();
  return result;
}
export async function readFundWorkbook(
  bytes: Uint8Array,
  fileName: string,
): Promise<ParsedFundSheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    bytes as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  const sheets: ParsedFundSheet[] = [];
  let totalRows = 0;
  for (const sheet of workbook.worksheets) {
    if (sheet.rowCount > 10030 || sheet.columnCount > 80)
      throw new Error("Mỗi bảng tối đa 10.000 dòng và 80 cột");
    const grid: string[][] = [];
    for (let i = 1; i <= sheet.rowCount; i++) {
      const values: string[] = [];
      for (let col = 1; col <= sheet.columnCount; col++) {
        const cell = sheet.getCell(i, col);
        // ExcelJS repeats the master's value for merged cells. Only the master
        // is a real cell; otherwise a merged narrative can look like a debit.
        values.push(
          cell.isMerged && cell.master.address !== cell.address
            ? ""
            : cellText(cell.value),
        );
      }
      grid.push(values);
    }
    const parsed = parseFundGrid(sheet.name, grid);
    if (parsed) {
      totalRows += parsed.rows.length;
      sheets.push(parsed);
    }
  }
  if (totalRows > 10000)
    throw new Error(
      "Mỗi file tối đa 10.000 giao dịch; tách file theo giai đoạn để nhập",
    );
  if (!sheets.length)
    throw new Error(
      `Không tìm thấy bảng thu chi trong ${fileName}. Cần cột Thời gian, Nội dung, Tiền ra và Tiền vào`,
    );
  return sheets;
}
export function importFileHash(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}
