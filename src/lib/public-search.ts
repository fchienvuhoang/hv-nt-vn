import { normalize } from "./domain";
const dateFormat=new Intl.DateTimeFormat("vi-VN",{dateStyle:"short",timeStyle:"short",timeZone:"Asia/Ho_Chi_Minh"});
const moneyFormat=new Intl.NumberFormat("vi-VN",{style:"currency",currency:"VND",maximumFractionDigits:0});
// Only pass the already-masked public DTO: hidden phone digits must not be searchable.
export function publicSearchText(row: {narrative:string;name:string;account:string;amount:string;at:string;dateUnknown?:boolean;originalAmount?:string;transferTrail?:{from:string;to:string;reason:string}[];notes?:{text:string}[]}) {
  return normalize(`${row.narrative} ${row.notes?.map(n=>n.text).join(" ")??""} ${row.transferTrail?.map(t=>`${t.from} ${t.to} ${t.reason}`).join(" ")??""} ${row.originalAmount??""} ${row.name} ${row.account} ${row.amount} ${moneyFormat.format(BigInt(row.amount))} ${row.dateUnknown?"CHUA CO NGAY TRONG EXCEL":dateFormat.format(new Date(row.at))}`);

}

export function publicSearchTerms(query:string){return normalize(query).split(" ").filter(Boolean);}
export function matchesPublicSearchText(text:string,terms:string[]){return terms.every(term=>text.includes(term));}
export function matchesPublicTransaction(row:Parameters<typeof publicSearchText>[0],query:string){return matchesPublicSearchText(publicSearchText(row),publicSearchTerms(query));}
