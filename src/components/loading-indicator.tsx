import {LoaderCircle} from "lucide-react";
export function LoadingSpinner({size=44}:{size?:number}){
 return <LoaderCircle size={size} className="app-loading-spinner" aria-hidden="true" strokeWidth={2.2}/>;
}
export function LoadingIndicator({label="Đang tải dữ liệu…",compact=false,className=""}:{label?:string;compact?:boolean;className?:string}){
 return <span className={`loading-indicator${compact?" compact":""} ${className}`} role="status" aria-live="polite"><LoadingSpinner size={compact?30:44}/><span>{label}</span></span>;
}
