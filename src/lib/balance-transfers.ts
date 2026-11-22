import 'server-only';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {fundTotals,serializable,type LedgerClient} from './ledger';
import {actorStamp,type Actor} from './actor';
import {transferBalanceError} from './transfer-balance';
import {AllocationTransferError,type AllocationTransferInput,type AllocationTransferPreview} from './allocation-transfers';
const schema=z.object({fromFundId:z.string().min(1).max(100),toFundId:z.string().min(1).max(100),accountId:z.string().min(1).max(100).optional(),mode:z.enum(['AMOUNT','TARGET_INCOME']),value:z.string().regex(/^\d{1,15}$/).transform(BigInt),reason:z.string().trim().min(5).max(1000)});
const hash=(data:unknown)=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
async function plan(tx:LedgerClient,input:AllocationTransferInput):Promise<AllocationTransferPreview>{
 const data=schema.parse(input);
 if(data.fromFundId===data.toFundId)throw new AllocationTransferError('Hai thiện pháp phải khác nhau');
 const funds=await fundTotals(tx,[data.fromFundId,data.toFundId]);
 const source=funds.find(f=>f.id===data.fromFundId),destination=funds.find(f=>f.id===data.toFundId);
 if(!source||!destination)throw new AllocationTransferError('Không tìm thấy thiện pháp');
 const incomeBefore=source.fundingIncome,destinationIncome=destination.fundingIncome;
 const amount=data.mode==='AMOUNT'?data.value:incomeBefore-data.value;
 const error=transferBalanceError(source.byAccount,amount,data.accountId,true);
 if(error)throw new AllocationTransferError(error);
 const accounts=await tx.bankAccount.findMany({select:{id:true,number:true}});
 let remaining=amount;
 const balanceItems:AllocationTransferPreview['balanceItems']=[];
 const scoped=[...source.byAccount].filter(a=>!data.accountId||a.accountId===data.accountId).sort((a,b)=>a.accountId.localeCompare(b.accountId));
 const planned=new Map<string,bigint>();
 // Use positive balances first; any shortfall belongs to the selected/primary account.
 for(const account of scoped){
  if(remaining===0n)break;
  if(account.balance<=0n)continue;
  const take=account.balance<remaining?account.balance:remaining;
  planned.set(account.accountId,take);remaining-=take;
 }
 if(remaining>0n){
  const overdraft=scoped.find(a=>a.accountId===source.accountId)??scoped[0];
  if(!overdraft)throw new AllocationTransferError('Không tìm thấy tài khoản nguồn để ghi nhận điều chuyển');
  planned.set(overdraft.accountId,(planned.get(overdraft.accountId)??0n)+remaining);
 }
 for(const account of scoped){
  const take=planned.get(account.accountId);if(!take)continue;
  const destinationBefore=destination.byAccount.find(a=>a.accountId===account.accountId)?.balance??0n;
  const bank=accounts.find(a=>a.id===account.accountId);
  if(!bank)throw new AllocationTransferError('Không tìm thấy tài khoản ngân hàng');
  balanceItems.push({accountId:account.accountId,accountNumber:bank.number,amount:take.toString(),sourceBefore:account.balance.toString(),sourceAfter:(account.balance-take).toString(),destinationBefore:destinationBefore.toString(),destinationAfter:(destinationBefore+take).toString()});
 }
 const result={fromFundId:source.id,toFundId:destination.id,fromCode:source.code,toCode:destination.code,fromName:source.name,toName:destination.name,amount:amount.toString(),incomeBefore:incomeBefore.toString(),incomeAfter:(incomeBefore-amount).toString(),destinationIncomeAfter:(destinationIncome+amount).toString(),sourceBalanceBefore:source.balance.toString(),sourceBalanceAfter:(source.balance-amount).toString(),destinationBalanceBefore:destination.balance.toString(),destinationBalanceAfter:(destination.balance+amount).toString(),items:[],balanceItems};
 return {...result,fingerprint:hash({kind:'BALANCE_ONLY',input:{...data,value:data.value.toString()},plan:result})};
}
export async function previewBalanceTransfer(input:AllocationTransferInput){return serializable(tx=>plan(tx,input));}
export async function commitBalanceTransfer(input:AllocationTransferInput&{requestId:string;fingerprint:string},actor:Actor){
 const requestId=z.string().uuid().parse(input.requestId),fingerprint=z.string().length(64).parse(input.fingerprint),data=schema.parse(input);
 const requestKey=hash({...data,value:data.value.toString(),fingerprint});
 return serializable(async tx=>{
  const previous=await tx.transfer.findUnique({where:{requestId}});
  if(previous){
   if(previous.mode!=='BALANCE_ONLY'||previous.requestKey!==requestKey||previous.actor!==actorStamp(actor).actor)throw new AllocationTransferError('Mã yêu cầu đã dùng cho thao tác khác');
   return previous;
  }
  const preview=await plan(tx,input);
  if(preview.fingerprint!==fingerprint)throw new AllocationTransferError('Số dư đã thay đổi sau khi xem trước. Chưa chuyển tiền, vui lòng xem trước lại.');
  const transfer=await tx.transfer.create({data:{requestId,fromFundId:data.fromFundId,toFundId:data.toFundId,accountId:preview.balanceItems.length===1?preview.balanceItems[0].accountId:null,amount:BigInt(preview.amount),reason:data.reason,mode:'BALANCE_ONLY',targetIncome:data.mode==='TARGET_INCOME'?data.value:null,requestKey,planFingerprint:fingerprint,...actorStamp(actor)}});
  await tx.transferBalanceItem.createMany({data:preview.balanceItems.map(item=>({...item,transferId:transfer.id,amount:BigInt(item.amount),sourceBefore:BigInt(item.sourceBefore),sourceAfter:BigInt(item.sourceAfter),destinationBefore:BigInt(item.destinationBefore),destinationAfter:BigInt(item.destinationAfter)}))});
  await tx.auditLog.create({data:{action:'BALANCE_TRANSFER_CREATED',entityId:transfer.id,...actorStamp(actor),details:{from:preview.fromCode,to:preview.toCode,amount:preview.amount,reason:data.reason,balanceItems:preview.balanceItems}}});
  return transfer;
 });
}
