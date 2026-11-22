export const FUND_NAME_SPACING_ERROR='Dấu "-" trong tên thiện pháp phải có khoảng trắng ở cả hai bên. Ví dụ: TP133 - HỘ TRÌ TÔN TƯỢNG.';

export function hasSpacedFundNameHyphens(value:string){
 const name=value.trim();
 for(let index=0;index<name.length;index++){
  if(name[index]==='-'&&(name[index-1]!==' '||name[index+1]!==' '))return false;
 }
 return true;
}
