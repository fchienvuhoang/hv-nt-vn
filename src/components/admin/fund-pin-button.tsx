"use client";
import {useActionState} from "react";
import {Pin,PinOff,LoaderCircle} from "lucide-react";
import {pinFund} from "@/lib/admin-api";
import {useActionToast} from "@/components/toasts";
export function FundPinButton({fundId,code,pinned}:{fundId:string;code:string;pinned:boolean}){
 const [state,action,pending]=useActionState(pinFund,{});useActionToast(state);
 const label=`${pinned?"Bỏ ghim":"Ghim lên đầu"} ${code}`;
 return <form action={action} className="fund-pin-form"><input type="hidden" name="fundId" value={fundId}/><input type="hidden" name="pinned" value={pinned?"0":"1"}/><button type="submit" className={`fund-pin-button${pinned?" pinned":""}`} disabled={pending} aria-label={label} aria-pressed={pinned} title={pending?"Đang lưu…":label}>{pending?<LoaderCircle size={14}/>:pinned?<PinOff size={14}/>:<Pin size={14}/>}</button></form>;
}
