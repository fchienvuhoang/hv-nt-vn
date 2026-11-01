import "server-only";
import { db } from "./db";
import type { Prisma } from "@/generated/prisma/client";
const actions=["FUND_CREATED","FUND_UPDATED","Hiển thị trên trang Minh bạch","Ẩn khỏi trang Minh bạch","Ghim thiện pháp","Bỏ ghim thiện pháp"];
function record(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{}}
function words(value:unknown):string[]{return Array.isArray(value)?value.filter((v):v is string=>typeof v==="string"):[]}
const fields=[ ["code","Mã thiện pháp"],["name","Tên thiện pháp"],["status","Trạng thái"],["description","Mô tả"],["sourceUrl","Link Excel nguồn"],["publicListed","Hiển thị trang Minh bạch"] ] as const;
function display(key:string,value:unknown){if(value===undefined)return "Không có dữ liệu cũ";if(value===null||value==="")return "(trống)";if(key==="status")return ({ACTIVE:"Đang hoạt động",PAUSED:"Tạm dừng",COMPLETED:"Hoàn thành"} as Record<string,string>)[String(value)]??String(value);if(typeof value==="boolean")return value?"Bật":"Tắt";return String(value)}
export function describeFundChange(action:string,details:Prisma.JsonValue){
  const data=record(details),created=action==="FUND_CREATED",before=record(data.before),after=created?data:record(data.after);
  if(action!=="FUND_CREATED"&&action!=="FUND_UPDATED")return {label:action,added:[] as string[],removed:[] as string[],changes:[{field:action.includes("ghim")||action.includes("Ghim")?"Ghim thiện pháp":"Hiển thị trang Minh bạch",before:display("",data.before),after:display("",data.after)}]};
  const oldWords=words(before.keywords),newWords=words(after.keywords);
  return {label:created?"Tạo thiện pháp":"Sửa cấu hình",added:newWords.filter(w=>!oldWords.includes(w)),removed:oldWords.filter(w=>!newWords.includes(w)),changes:fields.filter(([key])=>key in after&&(created||JSON.stringify(before[key])!==JSON.stringify(after[key]))).map(([key,label])=>({field:label,before:created?"Chưa tạo":display(key,before[key]),after:display(key,after[key])}))};
}
export async function loadFundHistory(fundId:string,page=1){
  await db.fund.findUniqueOrThrow({where:{id:fundId},select:{id:true}});
  const where={entityId:fundId,action:{in:actions}},pageSize=30;
  const [rows,total]=await Promise.all([db.auditLog.findMany({where,orderBy:[{createdAt:"desc"},{id:"desc"}],skip:(page-1)*pageSize,take:pageSize}),db.auditLog.count({where})]);
  return {page,pageSize,total,rows:rows.map(row=>({id:row.id,at:row.createdAt,actor:row.actor,actorId:row.actorId,actorName:row.actorName,...describeFundChange(row.action,row.details)}))};
}
export type FundHistory=Awaited<ReturnType<typeof loadFundHistory>>;
