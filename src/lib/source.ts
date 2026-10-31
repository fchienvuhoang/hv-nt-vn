import { z } from "zod";
import { parseSourceTime } from "./domain";
const itemSchema = z.object({
  id: z.string().min(1), bankAccountId: z.string(), refId: z.string().nullish(),
  transactionAmount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  type: z.enum(["CREDIT", "DEBIT"]), narrative: z.string().nullish(), displayName: z.string().nullish(),
  hiddenNarrative: z.boolean().optional(), hiddenNote: z.boolean().optional(),
  transactionTime: z.string().refine(s => Number.isFinite(parseSourceTime(s).getTime()), "Thời gian không hợp lệ"),
}).passthrough();
const responseSchema = z.object({ status: z.literal(200), data: z.object({ total: z.number().int().nonnegative(), page: z.number().int(), items: z.array(itemSchema) }) });
export type SourceItem = z.infer<typeof itemSchema>;
const bankIds: Record<string, string> = { "0572": "2028140453689352192", "0856": "2020703240433209344" };
export async function fetchSourcePage(accountNo: string, direction: "CREDIT" | "DEBIT", from: string, to: string, page: number, timeout = 12000) {
  const url = new URL("https://api-pilot.thiennguyen.app/api/v2/bank-account-transaction/search-by-accountNoV2");
  url.search = new URLSearchParams({ accountNo, fromDate: from, toDate: to, type: direction, keyword: "", pageSize: "100", page: String(page), withTotal: "true" }).toString();
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeout), headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Nguồn sao kê trả HTTP ${response.status}`);
  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("Cấu trúc API nguồn đã thay đổi; dừng để tránh nhập sai");
  const data = parsed.data.data;
  if (data.page !== page || data.items.some(i => i.type !== direction || i.bankAccountId !== bankIds[accountNo])) throw new Error("Nguồn trả sai tài khoản, loại giao dịch hoặc trang");
  return data;
}
