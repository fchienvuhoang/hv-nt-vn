import {NextResponse} from "next/server";
import {loadPublicTransferDetails} from "@/lib/public-transfer-details";
export async function GET(_request:Request,{params}:{params:Promise<{slug:string;id:string}>}){
 const {slug,id}=await params;
 if(!/^[a-z0-9-]{1,100}$/.test(slug)||!/^[-a-zA-Z0-9]{1,100}$/.test(id))return NextResponse.json({error:"Không tìm thấy điều chuyển."},{status:404});
 try{
  const data=await loadPublicTransferDetails(slug,id);
  return data?NextResponse.json(data,{headers:{"Cache-Control":"no-store"}}):NextResponse.json({error:"Không tìm thấy điều chuyển của thiện pháp này."},{status:404});
 }catch{return NextResponse.json({error:"Chưa tải được chi tiết điều chuyển."},{status:500})}
}
