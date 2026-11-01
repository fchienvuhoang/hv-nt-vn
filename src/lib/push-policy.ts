export const pushKinds = ["wrongAccount", "needsClassification", "syncError"] as const;
export type PushKind = typeof pushKinds[number];
export const pushLabels: Record<PushKind,string> = {
  wrongAccount: "Giao dịch sai tài khoản nhận",
  needsClassification: "Giao dịch cần phân loại",
  syncError: "Đồng bộ lỗi",
};
export const defaultPushPreferences = {wrongAccount:false, needsClassification:false, syncError:false};
export function transactionPushKind(row:{fundId?:string|null;assignment?:string;entryStatus?:string;matchReason?:string}):PushKind|null {
  if(row.entryStatus==="MERGED"||row.entryStatus==="REJECTED")return null;
  if(row.matchReason?.startsWith("Sai tài khoản nhận:"))return "wrongAccount";
  return !row.fundId&&row.assignment==="UNASSIGNED"?"needsClassification":null;
}
/** Only browser push services; never let a stored endpoint become an arbitrary server request. */
export function validPushEndpoint(endpoint:string){
  try{
    const url=new URL(endpoint),host=url.hostname;
    return url.protocol==="https:"&&!url.username&&!url.password&&!url.port&&(
      host==="fcm.googleapis.com"||host==="updates.push.services.mozilla.com"||
      host.endsWith(".push.services.mozilla.com")||host==="web.push.apple.com"||
      host.endsWith(".notify.windows.com"));
  }catch{return false;}
}
export function pushDestination(kind:PushKind){return kind==="syncError"?"/admin?view=sync":"/admin?view=transactions&pending=1";}
