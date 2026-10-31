"use client";
import {LoadingSpinner} from "@/components/loading-indicator";
import {useActionState} from "react";
import {Eye,EyeOff} from "lucide-react";
import {setFundVisibility} from "@/lib/admin-api";
import {useActionToast} from "@/components/toasts";
export function FundVisibilityButton({fundId,code,visible}:{fundId:string;code:string;visible:boolean}){
 const [state,action,pending]=useActionState(setFundVisibility,{});useActionToast(state);
 const label=`${visible?"Ẩn khỏi":"Hiển thị trên"} trang Minh bạch: ${code}`;
 return <form action={action} className="fund-pin-form"><input type="hidden" name="fundId" value={fundId}/><input type="hidden" name="visible" value={visible?"0":"1"}/><button className={`fund-visibility-button${visible?" visible":""}`} type="submit" disabled={pending} aria-label={label} aria-pressed={visible} title={pending?"Đang lưu…":label}>{pending?<LoadingSpinner size={20}/>:visible?<Eye size={17}/>:<EyeOff size={17}/>}</button></form>;
}
