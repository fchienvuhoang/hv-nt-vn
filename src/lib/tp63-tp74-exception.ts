import 'server-only';
import {createHash} from 'node:crypto';
import {fundTotals, serializable} from './ledger';
import {actorStamp} from './actor';

// One approved operation, deliberately unavailable through the REST/UI inputs.
const requestId = '6afd6842-91c0-43ec-8234-26ff57e5bb0e';
const transferId = 'chat-tp63-tp74-6afd6842-91c0-83ec-8234-26ff57e5bb0e';
const amount = 25_000_000n;
const actor = 'system:chat-authorized:6afd6842-91c0-83ec-8234-26ff57e5bb0e';
const reason = 'Theo yêu cầu người dùng: cắt 25.000.000 VNĐ từ TP63 sang TP74. Người dùng đã cho phép TP63 âm thêm và xác nhận ngoại lệ riêng cho khoản này trong luồng chat Điều chuyển ngân sách.';
const requestKey = createHash('sha256').update(JSON.stringify({requestId, amount:amount.toString(), actor, reason, from:'TP63', to:'TP74', account:'0572'})).digest('hex');

export async function runTp63Tp74Exception(commit = false) {
 return serializable(async tx => {
  const previous = await tx.transfer.findUnique({where:{requestId}, include:{fromFund:true,toFund:true,balanceItems:true}});
  if (previous) {
   if (previous.requestKey !== requestKey || previous.actor !== actor || previous.mode !== 'BALANCE_ONLY' || previous.amount !== amount || previous.fromFund.code !== 'TP63' || previous.toFund.code !== 'TP74' || previous.balanceItems.length !== 1 || previous.balanceItems[0].accountNumber !== '0572' || previous.balanceItems[0].amount !== amount)
    throw new Error('Mã yêu cầu đã được dùng cho thao tác khác');
   const reversal = await tx.transfer.findUnique({where:{reversalOf:previous.id}});
   if (reversal) throw new Error('Ngoại lệ đã được ghi rồi đảo; không tự ghi lại');
   return {status:'ALREADY_COMMITTED', transferId:previous.id, requestId};
  }
  const rows = await tx.fund.findMany({where:{code:{in:['TP63','TP74']}},select:{id:true,code:true}});
  if (rows.length !== 2) throw new Error('Không tìm thấy đúng hai mã TP63 và TP74');
  const totals = await fundTotals(tx, rows.map(f=>f.id));
  const source = totals.find(f=>f.code === 'TP63')!, destination = totals.find(f=>f.code === 'TP74')!;
  if (!source || !destination || source.id === destination.id || source.account.number !== '0572' || destination.account.number !== '0572' || source.accountId !== destination.accountId)
   throw new Error('Mã thiện pháp hoặc tài khoản gốc không đúng');
  const duplicate = await tx.transfer.findFirst({where:{fromFundId:source.id,toFundId:destination.id,amount}});
  if (duplicate) throw new Error(`Đã có khoản TP63 → TP74 cùng số tiền: ${duplicate.id}; cần đối chiếu, không ghi thêm`);
  if (source.balance !== -4_547_329n || destination.balance !== 0n)
   throw new Error('Số dư đã khác số được người dùng chấp thuận; chưa ghi điều chuyển');
  const accountId = source.accountId;
  const from = source.byAccount.find(a=>a.accountId === accountId)!, to = destination.byAccount.find(a=>a.accountId === accountId)!;
  if (!from || !to || accountId !== 'cmvw2f3kh00000or3r3fgruqs' || from.balance !== -4_747_329n || to.balance !== 0n) throw new Error('Số dư hoặc tài khoản 0572 đã khác ngoại lệ được duyệt');
  const item = {accountId,accountNumber:'0572',amount,sourceBefore:from.balance,sourceAfter:from.balance-amount,destinationBefore:to.balance,destinationAfter:to.balance+amount};
  const preview = {fromCode:source.code,toCode:destination.code,fromName:source.name,toName:destination.name,amount:amount.toString(),sourceBefore:source.balance.toString(),sourceAfter:(source.balance-amount).toString(),destinationBefore:destination.balance.toString(),destinationAfter:(destination.balance+amount).toString(),accountNumber:'0572',requestId};
  if (!commit) return {status:'PREVIEW',...preview};
  const transfer = await tx.transfer.create({data:{id:transferId,requestId,requestKey,fromFundId:source.id,toFundId:destination.id,accountId,amount,reason,mode:'BALANCE_ONLY',planFingerprint:createHash('sha256').update(JSON.stringify(preview)).digest('hex'),...actorStamp(actor)}});
  await tx.transferBalanceItem.createMany({data:[{...item,transferId:transfer.id}]});
  await tx.auditLog.create({data:{action:'BALANCE_TRANSFER_CREATED',entityId:transfer.id,...actorStamp(actor),details:{...preview,reason,negativeBalanceAuthorized:true,authorizationScope:'ONE_TRANSFER_ONLY',authorizationChat:'6afd6842-91c0-83ec-8234-26ff57e5bb0e',balanceItems:[Object.fromEntries(Object.entries(item).map(([k,v])=>[k,typeof v === 'bigint'?v.toString():v]))]}}});
  const after = await fundTotals(tx,[source.id,destination.id]);
  const afterSource = after.find(f=>f.id === source.id)!, afterDestination = after.find(f=>f.id === destination.id)!;
  if (afterSource.balance !== source.balance-amount || afterDestination.balance !== destination.balance+amount)
   throw new Error('Đối chiếu sau ghi thất bại; hoàn tác toàn bộ');
  for (const beforeFund of [source,destination]) {
   const afterFund = after.find(f=>f.id === beforeFund.id)!;
   if (beforeFund.income !== afterFund.income || beforeFund.expense !== afterFund.expense || beforeFund.count !== afterFund.count)
    throw new Error('Giao dịch gốc đã thay đổi; hoàn tác toàn bộ');
  }
  for (const account of source.byAccount) {
   const sum = (funds:typeof totals) => funds.reduce((n,f)=>n+(f.byAccount.find(a=>a.accountId === account.accountId)?.balance??0n),0n);
   if (sum(totals) !== sum(after)) throw new Error('Tổng số dư tài khoản thay đổi; hoàn tác toàn bộ');
  }
  return {status:'COMMITTED',transferId:transfer.id,...preview};
 });
}
