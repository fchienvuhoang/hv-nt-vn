import {NextRequest,NextResponse} from "next/server";
import {publicDirectory} from "@/lib/public-data";
export async function GET(request:NextRequest){
 try{return NextResponse.json(await publicDirectory(request.nextUrl.searchParams.get("q")??"",Number(request.nextUrl.searchParams.get("page"))||1),{headers:{"Cache-Control":"public, max-age=0, must-revalidate"}})}
 catch{return NextResponse.json({error:"Chưa tải được danh sách thiện pháp. Vui lòng thử lại."},{status:500})}
}
