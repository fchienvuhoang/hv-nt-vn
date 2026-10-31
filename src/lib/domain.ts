export type FundRule = {
  id: string;
  accountId: string;
  code: string;
  keywords: string[];
  status: string;
  accountIds?: string[];
};
export function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
function contains(text: string, keyword: string) {
  // Ignore spaces *inside* a code/phrase, while retaining word boundaries.
  // TP112, tp 112 and T P 112 match; TP1120 and XTP112 do not.
  const letters = normalize(keyword).replace(/ /g, "");
  if (!letters) return false;
  return new RegExp(`(?:^| )${letters.split("").join(" *")}(?= |$)`).test(text);
}
export function classify(
  narrative: string,
  accountId: string,
  rules: FundRule[],
) {
  const text = normalize(narrative);
  const scoped = rules.filter((r) => fundUsesAccount(r, accountId));
  const codes = scoped.filter((r) => contains(text, r.code));
  // An explicit inactive code must not fall through to an active fund's alias.
  const matches = codes.length
    ? codes
    : scoped.filter((r) => r.keywords.some((k) => contains(text, k)));
  if (matches.length !== 1)
    return {
      fundId: null,
      reason: matches.length
        ? "Khớp nhiều thiện pháp; cần kiểm tra"
        : "Không tìm thấy mã hoặc từ khóa",
    };
  if (matches[0].status !== "ACTIVE")
    return {
      fundId: null,
      reason: `Khớp ${matches[0].code} nhưng thiện pháp đã tạm dừng hoặc hoàn thành`,
      matchedInactiveFundId: matches[0].id,
    };
  return {
    fundId: matches[0].id,
    reason: `Khớp ${codes.length ? "mã" : "từ khóa"} ${matches[0].code}`,
  };
}
// VN mobile, landline and international prefixes; preserve existing masked values.
export function maskPhones(value: string) {
  return value
    .replace(
      /(?<![\d*])(?:\+?84|0084|0)[\d .()\-]{3,12}[xX*]{2,}(?!\d)/g,
      (match) => "*".repeat(match.replace(/\D/g, "").length) + "***",
    )
    .replace(/(?<![\d*])(?:\+|00)(?:[ .()\-]*\d){8,15}(?!\d)/g, (match) => {
      const digits = match.replace(/\D/g, "");
      return "*".repeat(digits.length - 3) + digits.slice(-3);
    })
    .replace(
      /(?<![\d*])(?:\+?84|0084|0)(?:[ .()\-]*\d){8,10}(?!\d)/g,
      (match) => {
        const digits = match.replace(/\D/g, "");
        return "*".repeat(digits.length - 3) + digits.slice(-3);
      },
    );
}
export function openingBalance(fund: {
  openingIncome: bigint;
  openingExpense: bigint;
  openingTransferNet: bigint;
}) {
  return fund.openingIncome - fund.openingExpense + fund.openingTransferNet;
}
export function vnd(value: bigint | string | number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(BigInt(value));
}
export function dateTime(value: Date | string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}
export function localDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
export function startOfVietnamDay(date: string) {
  return new Date(`${date}T00:00:00+07:00`);
}
export function parseSourceTime(value: string) {
  return new Date(
    /[zZ]$|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}+07:00`,
  );
}

export function fundUsesAccount(
  fund: { accountId: string; accountIds?: string[] },
  accountId: string,
) {
  return fund.accountId === accountId || !!fund.accountIds?.includes(accountId);
}
