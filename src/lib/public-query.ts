export function publicQuery(query:{page?:string|string[]|null;type?:string|string[]|null;q?:string|string[]|null}){
  const page=typeof query.page==="string"?Number(query.page):1;
  return {page:Number.isFinite(page)?Math.min(100000,Math.max(1,Math.floor(page)||1)):1,direction:query.type==="DEBIT"?"DEBIT" as const:"CREDIT" as const,search:(typeof query.q==="string"?query.q:"").trim().slice(0,100)};
}
