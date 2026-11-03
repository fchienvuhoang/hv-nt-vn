/** Keep VND as digit strings; never round monetary input through Number. */
export function moneyInputDigits(value: string, maxDigits = 15): string | null {
  if (!/^[\d.,\s\u00a0\u202f]*$/.test(value)) return null;
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits.length <= maxDigits ? digits : null;
}

export function formatMoneyInput(digits: string) {
  return digits.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function pastedMoneyDigits(value: string, maxDigits = 15): string | null {
  const text = value.trim().replace(/\s*(?:₫|đ|VND)\s*$/i, "").trim();
  // Reject signs, scientific notation and ambiguous fractional amounts rather than changing their value.
  if (!/^\d+$/.test(text) && !/^\d{1,3}([.,\s\u00a0\u202f])\d{3}(?:\1\d{3})*$/.test(text)) return null;
  return moneyInputDigits(text, maxDigits);
}

export function moneyCaretPosition(formatted: string, digitCount: number) {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < formatted.length; index++) if (/\d/.test(formatted[index]) && ++seen === digitCount) return index + 1;
  return formatted.length;
}
