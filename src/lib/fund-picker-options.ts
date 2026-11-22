import {normalize} from './domain';
export type FundPickerOption={id:string;code:string;name:string;status?:string;createdAt?:Date|string;fundingIncome?:bigint|string;income?:bigint|string;excessExpense?:bigint|string;balance?:bigint|string;accountId?:string;accountIds?:string[]};
export function fundPickerStatus(status?:string){
 return status==='ACTIVE'?'Đang hoạt động':status==='PAUSED'?'Tạm dừng':status==='COMPLETED'?'Đã hoàn thành':'Đang tải trạng thái';
}
export function fundPickerAmounts(fund:FundPickerOption){
 const income=fund.fundingIncome??fund.income;
 const balance=fund.balance===undefined?undefined:BigInt(fund.balance);
 return {income:income===undefined?undefined:BigInt(income),excess:fund.excessExpense!==undefined?BigInt(fund.excessExpense):balance===undefined?undefined:balance<0n?-balance:0n};
}
export function fundPickerOptions(funds:FundPickerOption[],metadata:Map<string,FundPickerOption>,query=''){
 const terms=normalize(query).split(' ').filter(Boolean);
 const time=(fund:FundPickerOption)=>fund.createdAt?new Date(fund.createdAt).getTime():Infinity;
 return funds.map(fund=>({...fund,...metadata.get(fund.id)})).filter(fund=>{
  const text=normalize(`${fund.code} ${fund.name}`);return terms.every(term=>text.includes(term));
 }).sort((a,b)=>{
  const first=time(a),second=time(b);
  return first<second?-1:first>second?1:a.id.localeCompare(b.id);
 });
}
