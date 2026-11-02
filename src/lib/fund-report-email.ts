import { brandedEmail } from "./email-template";
import { vnd } from "./domain";
import { summarizeBalances } from "./balance-summary";

type Fund = { code: string; name: string; status: string; income: bigint; expense: bigint; balance: bigint; goalAmount: bigint | null };
type Expense = { at: Date; account: string; amount: bigint; narrative: string; assignment: string; reason: string; funds: { code: string; amount: bigint }[] };
export function fundReportSubject(date: string) { return `Báo cáo thu chi thiện pháp ngày ${date}`; }

export function fundReportEmail(input: {
  funds: Fund[]; generatedAt: Date; syncAt: Date | null; yesterday: string;
  yesterdayIncome: bigint; yesterdayExpense: bigint;
  yesterdayFunds?: { code: string; name: string; income: bigint; expense: bigint }[];
  expenses?: Expense[]; website?: string; automated?: boolean;
}) {
  const { funds } = input;
  const date = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" });
  const time = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });
  const sum = (key: "income" | "expense") => funds.reduce((value, fund) => value + fund[key], 0n);
  const balances = summarizeBalances(funds);
  const goals = funds.filter(fund => fund.goalAmount !== null && fund.goalAmount > 0n);
  const near = goals.filter(fund => fund.status === "ACTIVE" && fund.income * 100n >= fund.goalAmount! * 80n && fund.income < fund.goalAmount!);
  const reached = goals.filter(fund => fund.income >= fund.goalAmount!);
  const progress = (fund: Fund) => fund.goalAmount && fund.goalAmount > 0n ? `${vnd(fund.goalAmount)} · ${(Number((fund.income > 0n ? fund.income : 0n) * 1000n / fund.goalAmount) / 10).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%` : "Chưa đặt";
  return { subject: fundReportSubject(input.yesterday), ...brandedEmail({
    wide: true, denseTables: true,
    label: "BÁO CÁO QUẢN TRỊ · SỐ LIỆU THỰC TẾ",
    title: fundReportSubject(input.yesterday),
    paragraphs: [
      `${funds.length} thiện pháp · Trích xuất ${date.format(input.generatedAt)} (giờ Việt Nam). ${input.syncAt ? `Đồng bộ đầy đủ gần nhất: ${date.format(input.syncAt)}.` : "Chưa xác nhận được thời điểm đồng bộ đầy đủ; số liệu có thể chưa bao gồm giao dịch mới nhất."}`,
      `${near.length} thiện pháp từ 80% đến dưới 100% mục tiêu; ${reached.length} thiện pháp đạt hoặc vượt mục tiêu. Đây là tình trạng hiện tại, không phải thông báo vừa chạm mốc.`,
    ],
    tables: [
      { title: `Tổng thu chi hôm qua · ${input.yesterday}`, columns: ["Tổng thu", "Tổng chi", "Thu − chi"], rows: [[vnd(input.yesterdayIncome), vnd(input.yesterdayExpense), vnd(input.yesterdayIncome - input.yesterdayExpense)]] },
      ...(input.yesterdayFunds ? [{ title: "Thu chi hôm qua theo thiện pháp", columns: ["Thiện pháp", "Thu trong ngày", "Chi trong ngày"], widths: [60, 20, 20], nowrapColumns: [0, 1, 2], rows: input.yesterdayFunds.filter(fund => fund.income !== 0n || fund.expense !== 0n).map(fund => [`${fund.code} · ${fund.name}`, vnd(fund.income), vnd(fund.expense)]) }] : []),
      ...(input.expenses ? [{ title: `Khoản chi hôm qua · ${input.expenses.length} khoản`, columns: ["Giờ / TK", "Số tiền", "Cú pháp chi / Nội dung gốc", "Gán vào thiện pháp / Cách gán"], rows: input.expenses.length ? input.expenses.map(row => [
        `${time.format(row.at)} · TK ${row.account}`, vnd(row.amount), row.narrative || "Không có nội dung chuyển khoản",
        `${row.funds.length ? row.funds.map(fund => `${fund.code}${row.funds.length > 1 ? `: ${vnd(fund.amount)}` : ""}`).join("; ") : "Chưa phân loại"} · ${!row.funds.length ? "Chưa gán" : row.assignment === "AUTO" ? "Gán tự động" : "Gán tay"}${row.reason ? ` · ${row.reason}` : ""}`,
      ]) : [["—", "0₫", "Không có khoản chi đã ghi nhận trong ngày", "—"]] }] : []),
      { title: `Danh sách toàn bộ ${funds.length} thiện pháp · Lũy kế`, columns: ["Mã / Thiện pháp", "Tổng thu", "Tổng chi", "Số dư sổ", "Mục tiêu / Tiến độ"], widths: [42, 14, 14, 14, 16], nowrapColumns: [0, 1, 2, 3, 4], rows: [
        ...funds.map(fund => [`${fund.code} · ${fund.name}`, vnd(fund.income), vnd(fund.expense), vnd(fund.balance), progress(fund)]),
        ["TỔNG CỘNG", vnd(sum("income")), vnd(sum("expense")), vnd(balances.balance), "—"],
      ] },
    ],
    ...(input.website ? { link: { label: "Mở trang quản trị", url: new URL("/admin?view=funds", input.website).href } } : {}),
    note: "Thu/chi hôm qua tính theo ngày giao dịch đã ghi nhận, gồm cả khoản chưa phân loại (có dòng riêng); không tính số dư chuyển sang, nghi trùng hoặc điều chuyển nội bộ. Cú pháp chi là nội dung chuyển khoản gốc, không suy diễn nội dung mới. Bảng lũy kế gồm khoản chuyển sang từ Excel, không bao gồm tiền chưa phân loại vào thiện pháp và không phải số dư ngân hàng. Khoản thu phân bổ chỉ tính phần tiền của từng thiện pháp. Số dư sổ giữ cả phần âm và điều chuyển. Tiến độ dùng tổng thu lũy kế, không trừ chi. " + (input.automated ? "Báo cáo hằng ngày lúc 07:00, giờ Việt Nam; thu/chi hôm qua và lũy kế tại thời điểm trích xuất." : "Email gửi theo yêu cầu."),
  }) };
}
