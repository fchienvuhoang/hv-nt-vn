import { z } from "zod";
export const balanceProfiles:Record<string,{username:string;bankId:string;userId:string}>={
  "0572":{username:"hvnguyenthuyvnhotritambao",bankId:"2028140453689352192",userId:"2020856147493257216"},
  "0856":{username:"hvnguyenthuyvnphungsucongdong",bankId:"2020703240433209344",userId:"2011680198621147136"},
};
const money=z.union([z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),z.string().regex(/^\d{1,30}$/)]).transform(v=>BigInt(v)).refine(v=>v<=9223372036854775807n,"Số tiền vượt giới hạn lưu trữ");
const schema=z.object({status:z.literal(200),data:z.object({accountNumber:z.string(),username:z.string(),userId:z.string(),totalCredit:money,totalDebit:money})});
/** Use the same live statement summary as the website, never the initial HTML profile totals. */
export function parseSourceBalance(raw:unknown,number:string){
  const profile=balanceProfiles[number];if(!profile)throw new Error("Tài khoản chưa có nguồn tổng thu/chi");
  const parsed=schema.safeParse(raw);if(!parsed.success)throw new Error("Cấu trúc API tổng thu/chi nguồn đã thay đổi");
  const account=parsed.data.data;
  if(account.username!==profile.username||account.accountNumber!==number||account.userId!==profile.userId)throw new Error("Nguồn tổng thu/chi trả sai tài khoản");
  return {totalCredit:account.totalCredit,totalDebit:account.totalDebit,balance:account.totalCredit-account.totalDebit,updatedAt:null};
}
export async function fetchSourceBalance(number:string){
  if(!balanceProfiles[number])throw new Error("Tài khoản chưa có nguồn tổng thu/chi");
  const response=await fetch(`https://api-pilot.thiennguyen.app/api/v2/bank-account-transaction/${number}/transactionsV2?pageSize=1&pageNumber=1`,{cache:"no-store",signal:AbortSignal.timeout(4000),headers:{Accept:"application/json"}});
  if(!response.ok)throw new Error(`Nguồn tổng thu/chi trả HTTP ${response.status}`);
  return parseSourceBalance(await response.json(),number);
}
