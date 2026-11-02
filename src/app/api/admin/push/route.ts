import {NextRequest,NextResponse} from "next/server";
import {createHash} from "node:crypto";
import {z} from "zod";
import {auth,allowedAdmin} from "@/auth";
import {db} from "@/lib/db";
import {pushConfigured,sendAdminPush} from "@/lib/admin-push";
import {defaultPushPreferences,validPushEndpoint} from "@/lib/push-policy";
export const runtime="nodejs";
const preferences=z.object({wrongAccount:z.boolean(),needsClassification:z.boolean(),syncError:z.boolean(),fundGoalReached:z.boolean().optional()}).strict();
const endpoint=z.string().max(2048).refine(validPushEndpoint,"Dịch vụ thông báo không được hỗ trợ.");
const key=(bytes:number)=>z.string().regex(/^[A-Za-z0-9_-]+={0,2}$/).max(128).refine(s=>Buffer.from(s,"base64url").length===bytes,"Khóa thông báo không hợp lệ.");
const subscription=z.object({endpoint,keys:z.object({p256dh:key(65),auth:key(16)}),expirationTime:z.number().nullable().optional()});
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
async function handle(request:NextRequest){
  const session=await auth(),email=session?.user?.email?.toLowerCase();
  if(!email)return json({error:"Vui lòng đăng nhập quản trị."},401);
  if(!allowedAdmin(email))return json({error:"Không có quyền quản trị."},403);
  if(request.method!=="GET"&&request.headers.get("origin")!==request.nextUrl.origin)return json({error:"Nguồn yêu cầu không hợp lệ."},403);
  try{
    if(request.method==="GET"){
      const pref=await db.pushPreference.findUnique({where:{email}});
      const devices=await db.adminPushSubscription.findMany({where:{email},select:{endpoint:true}});
      return json({preferences:pref?{wrongAccount:pref.wrongAccount,needsClassification:pref.needsClassification,syncError:pref.syncError,fundGoalReached:pref.fundGoalReached}:defaultPushPreferences,publicKey:pushConfigured()?process.env.VAPID_PUBLIC_KEY:null,devices:devices.map(s=>createHash("sha256").update(s.endpoint).digest("hex"))});
    }
    const body=await request.json();
    if(request.method==="PUT"){
      const data=preferences.parse(body);
      await db.pushPreference.upsert({where:{email},create:{email,...data},update:data});
      return json({success:true});
    }
    if(request.method==="DELETE"){
      await db.adminPushSubscription.deleteMany({where:{email,endpoint:endpoint.parse(body.endpoint)}});
      return json({success:true});
    }
    if(request.method==="POST"&&body.action==="subscribe"){
      if(!pushConfigured())return json({error:"Thông báo đẩy chưa được cấu hình."},503);
      const sub=subscription.parse(body.subscription);
      await db.$transaction(async tx=>{
        await tx.pushPreference.upsert({where:{email},create:{email},update:{}});
        // Rebinding a shared browser must not deliver the previous administrator's queue.
        await tx.adminPushSubscription.deleteMany({where:{endpoint:sub.endpoint,email:{not:email}}});
        await tx.adminPushSubscription.upsert({where:{endpoint:sub.endpoint},create:{email,endpoint:sub.endpoint,...sub.keys},update:{...sub.keys}});
      });
      return json({success:true});
    }
    if(request.method==="POST"&&body.action==="test"){
      const sub=await db.adminPushSubscription.findFirst({where:{email,endpoint:endpoint.parse(body.endpoint)}});
      if(!sub)return json({error:"Thiết bị chưa bật thông báo."},404);
      const leaseId=`push-test:${sub.id}`;
      const allowed=await db.$executeRaw`INSERT INTO "SyncLease" (id,token,"expiresAt") VALUES (${leaseId},'test',(NOW() AT TIME ZONE 'UTC')+INTERVAL '60 seconds') ON CONFLICT (id) DO UPDATE SET "expiresAt"=EXCLUDED."expiresAt" WHERE "SyncLease"."expiresAt" < (NOW() AT TIME ZONE 'UTC')`;
      if(!allowed)return json({error:"Vui lòng chờ một phút trước khi thử lại."},429);
      await sendAdminPush(sub,{title:"Thông báo quản trị đã sẵn sàng",body:"Thiết bị này có thể nhận những loại thông báo bạn đã chọn.",url:"/admin",tag:"admin-test"});
      return json({success:true});
    }
    return json({error:"Yêu cầu không hợp lệ."},400);
  }catch(error){
    if(error instanceof z.ZodError)return json({error:error.issues.map(i=>i.message).join("; ")},400);
    console.error("Admin push settings failed",error instanceof Error?error.name:"unknown");
    return json({error:"Không xử lý được thông báo. Vui lòng thử lại."},500);
  }
}
export const GET=handle;export const POST=handle;export const PUT=handle;export const DELETE=handle;
