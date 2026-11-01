/** Display names only; bank account identifiers remain unchanged. */
export function accountLabel(number: string) {
  return number.split(" · ").map(value => value === "0572" ? "0572 – My" : value === "0856" ? "0856 – Trâm" : value).join(" · ");
}

export function fundOptionLabel(
  fund: {code:string;name:string;accountId:string;accountIds?:string[]},
  accounts: {id:string;number:string}[],
) {
  const ids=[...new Set([fund.accountId,...(fund.accountIds??[])])];
  const labels=ids.map(id=>{const account=accounts.find(a=>a.id===id);return account?accountLabel(account.number):"Tài khoản đã cấu hình"});
  return `${fund.code} · ${fund.name} — ${ids.length===1?"Chỉ ":""}${labels.join(", ")}`;
}
