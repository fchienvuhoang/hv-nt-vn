import { normalize } from "./domain";
const dateFormat=new Intl.DateTimeFormat("vi-VN",{dateStyle:"short",timeStyle:"short",timeZone:"Asia/Ho_Chi_Minh"});
const moneyFormat=new Intl.NumberFormat("vi-VN",{style:"currency",currency:"VND",maximumFractionDigits:0});
// Only pass the already-masked public DTO: hidden phone digits must not be searchable.
export function matchesPublicTransaction(row: {narrative:string;name:string;account:string;amount:string;at:string;notes?:{text:string}[]}, query:string) {
  const text=normalize(`${row.narrative} ${row.notes?.map(n=>n.text).join(" ")??""} ${row.name} ${row.account} ${row.amount} ${moneyFormat.format(BigInt(row.amount))} ${dateFormat.format(new Date(row.at))}`);
  return normalize(query).split(" ").filter(Boolean).every(term=>text.includes(term));
}
