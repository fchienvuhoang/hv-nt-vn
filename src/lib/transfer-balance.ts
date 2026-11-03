// The whole fund and the selected bank accounts must both cover a transfer.
// A positive account cannot be used to spend the deficit of another account.
export function transferBalanceError(balances: {accountId:string;balance:string|bigint}[], amount:bigint|null, accountId?:string):string|null {
  const total=balances.reduce((sum,a)=>sum+BigInt(a.balance),0n);
  if(total<=0n)return "Thiện pháp nguồn phải có số dư dương mới được điều chuyển.";
  const available=balances.filter(a=>!accountId||a.accountId===accountId).reduce((sum,a)=>sum+(BigInt(a.balance)>0n?BigInt(a.balance):0n),0n);
  if(available<=0n)return "Thiện pháp nguồn không có số dư khả dụng trong phạm vi tài khoản đã chọn.";
  if(amount!==null&&amount<=0n)return "Số tiền điều chuyển phải lớn hơn 0; mức thành tựu phải nhỏ hơn tổng hùn phước hiện tại.";
  if(amount!==null&&(amount>total||amount>available))return "Không đủ số dư khả dụng để điều chuyển. Số tiền chuyển không được làm âm thiện pháp nguồn hoặc tài khoản nguồn.";
  return null;
}
