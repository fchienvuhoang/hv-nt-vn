import { brandedEmail } from "./email-template";
import { vnd } from "./domain";
import { summarizeBalances } from "./balance-summary";

type Fund = { code: string; name: string; status: string; income: bigint; expense: bigint; balance: bigint; goalAmount: bigint | null };
export function fundReportEmail(input: {
  funds: Fund[];
  generatedAt: Date;
  syncAt: Date | null;
  yesterday: string;
  yesterdayIncome: bigint;
  yesterdayExpense: bigint;
  website?: string;
}) {
  const { funds } = input;
  const date = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" });
  const sum = (key: "income" | "expense") => funds.reduce((value, fund) => value + fund[key], 0n);
  const balances = summarizeBalances(funds);
  const goals = funds.filter(fund => fund.goalAmount !== null && fund.goalAmount > 0n).sort((a, b) => {
    const left = a.income * b.goalAmount!, right = b.income * a.goalAmount!;
    return left > right ? -1 : left < right ? 1 : a.code.localeCompare(b.code, "vi");
  });
  const near = goals.filter(fund => fund.status === "ACTIVE" && fund.income * 100n >= fund.goalAmount! * 80n && fund.income < fund.goalAmount!);
  const reached = goals.filter(fund => fund.income >= fund.goalAmount!);
  const status = (value: string) => ({ ACTIVE: "Đang hoạt động", PAUSED: "Tạm dừng", COMPLETED: "Hoàn thành" })[value] ?? value;
  return brandedEmail({
    label: "BÁO CÁO QUẢN TRỊ · SỐ LIỆU THỰC TẾ",
    title: "Tổng quan thiện pháp",
    paragraphs: [
      `Kính gửi quý quản trị viên, báo cáo tổng hợp ${funds.length} thiện pháp trong hệ thống, gồm ${funds.filter(fund => fund.status === "ACTIVE").length} thiện pháp đang hoạt động. Số liệu được trích xuất lúc ${date.format(input.generatedAt)} (giờ Việt Nam).`,
      input.syncAt ? `Lượt đồng bộ đầy đủ gần nhất: ${date.format(input.syncAt)} (giờ Việt Nam).` : "Chưa xác nhận được thời điểm đồng bộ đầy đủ cho tất cả tài khoản; số liệu có thể chưa bao gồm giao dịch mới nhất.",
      `Có ${goals.length} thiện pháp đã đặt mục tiêu: ${near.length} thiện pháp từ 80% đến dưới 100%, ${reached.length} thiện pháp đạt hoặc vượt mục tiêu. Đây là tình trạng hiện tại, không phải thông báo vừa chạm mốc.`,
    ],
    metrics: [
      { label: "Tổng hùn phước đã ghi nhận", value: vnd(sum("income")) },
      { label: "Tổng đã chi", value: vnd(sum("expense")) },
      { label: "Tổng số dư khả dụng của các thiện pháp", value: vnd(balances.availableBalance) },
      { label: "Tổng chi vượt quỹ", value: vnd(balances.excessExpense) },
    ],
    tables: [
      { title: `Thu / chi ngày ${input.yesterday}`, columns: ["Hùn phước", "Đã chi"], rows: [[vnd(input.yesterdayIncome), vnd(input.yesterdayExpense)]] },
      ...(goals.length ? [{ title: "Tiến độ các thiện pháp có mục tiêu", columns: ["Thiện pháp", "Đã hùn phước / Mục tiêu", "Tiến độ / Còn cần"], rows: goals.map(fund => {
        const goal = fund.goalAmount!, remaining = goal > fund.income ? goal - fund.income : 0n;
        const percent = Number((fund.income > 0n ? fund.income : 0n) * 1000n / goal) / 10;
        return [`${fund.code}\n${fund.name}`, `${vnd(fund.income)}\nMục tiêu: ${vnd(goal)}`, `${percent.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%\n${remaining > 0n ? `Còn ${vnd(remaining)}` : "Đã đạt mục tiêu"}`];
      }) }] : []),
      { title: `Chi tiết toàn bộ ${funds.length} thiện pháp`, columns: ["Thiện pháp", "Hùn phước / Đã chi", "Số dư sổ"], rows: funds.map(fund => [`${fund.code}\n${fund.name}\n${status(fund.status)}`, `Thu: ${vnd(fund.income)}\nChi: ${vnd(fund.expense)}`, vnd(fund.balance)]) },
    ],
    ...(input.website ? { link: { label: "Mở trang quản trị", url: new URL("/admin?view=funds", input.website).href } } : {}),
    note: "Tổng hợp theo sổ thiện pháp, gồm khoản chuyển sang từ Excel; không bao gồm tiền chưa phân loại vào thiện pháp và không phải số dư ngân hàng. Thu/chi hôm qua tính theo ngày giao dịch đã ghi nhận vào thiện pháp, không theo thời điểm nhập dữ liệu. Số dư sổ giữ cả phần âm và điều chuyển. Tiến độ dùng tổng hùn phước lũy kế, không trừ chi; thiện pháp dài hạn cũng dùng lũy kế toàn sổ. Email này được gửi theo yêu cầu, chưa xác nhận lịch gửi tự động buổi sáng.",
  });
}
