import { localDate, startOfVietnamDay } from "./domain";
export function transactionDates(from?: string, to?: string) {
  const today = localDate();
  const first = from || today, last = to || today;
  const valid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(startOfVietnamDay(date).getTime()) && localDate(startOfVietnamDay(date)) === date;
  if (!valid(first) || !valid(last) || first > last) return { from: today, to: today, start: startOfVietnamDay(today), end: new Date(startOfVietnamDay(today).getTime()+86400000), error: "Khoảng ngày không hợp lệ. Đang hiển thị giao dịch hôm nay; chọn lại Từ ngày / Đến ngày." };
  return { from: first, to: last, start: startOfVietnamDay(first), end: new Date(startOfVietnamDay(last).getTime()+86400000), error: undefined };
}
