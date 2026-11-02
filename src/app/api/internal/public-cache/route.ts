import {NextResponse} from "next/server";
import {timingSafeEqual} from "node:crypto";
import {queuePublicRefresh,runPublicRefresh} from "@/lib/public-snapshot";
export const runtime="nodejs";
export const maxDuration=300;
export async function POST(request:Request){
 const secret=process.env.SYNC_SECRET;if(!secret||secret.length<32)return NextResponse.json({error:"Not configured"},{status:503});
 const actual=Buffer.from(request.headers.get("authorization")??""),expected=Buffer.from(`Bearer ${secret}`);
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return NextResponse.json({error:"Unauthorized"},{status:401});
 if(new URL(request.url).searchParams.get("force")==="1")await queuePublicRefresh();
 return NextResponse.json(await runPublicRefresh(100),{headers:{"Cache-Control":"no-store"}});
}
