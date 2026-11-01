/** Display names only; bank account identifiers remain unchanged. */
export function accountLabel(number: string) {
  return number.split(" · ").map(value => value === "0572" ? "0572 – My" : value === "0856" ? "0856 – Trâm" : value).join(" · ");
}
