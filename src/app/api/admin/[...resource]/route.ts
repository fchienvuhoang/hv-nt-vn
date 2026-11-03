import {loadFundActivity} from "@/lib/fund-activity";
import {transactionDates} from "@/lib/transaction-scope";
import {localDate} from "@/lib/domain";
import {dispatchAdminNotificationsSafely} from "@/lib/fund-goal-notifications";
import {after} from "next/server";
import {queuePublicRefresh,refreshPublicSafely,runPublicRefresh} from "@/lib/public-snapshot";
import {loadFundHistory} from "@/lib/fund-history";
import {loadAdminRevision} from "@/lib/admin-revision";
import { loadTransactionSummary } from "@/lib/transaction-summary";
import {previewAllocationTransfer,isAllocationTransferError} from "@/lib/allocation-transfers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth, allowedAdmin } from "@/auth";
import * as actions from "@/app/admin/actions";
import { encodeAdmin } from "@/lib/admin-codec";
import { loadAdminBootstrap,loadAdminTransactions,loadAdminTransfers,loadAdminSync,loadReviewCandidates,loadTransferDetails } from "@/lib/admin-read-model";
export const runtime="nodejs";
export const maxDuration=300;
const json=(data:unknown,status=200)=>NextResponse.json(encodeAdmin(data),{status,headers:{"Cache-Control":"private, no-store"}});
async function handle(request:NextRequest,context:{params:Promise<{resource:string[]}>}){
  const session=await auth();
  if(!session?.user?.email)return json({error:"Phiên đăng nhập đã hết hạn."},401);
  if(!allowedAdmin(session.user.email))return json({error:"Email không có quyền quản trị."},403);
  const resource=(await context.params).resource.join("/"),query=Object.fromEntries(request.nextUrl.searchParams);
  if(request.method!=="GET"&&request.headers.get("origin")!==request.nextUrl.origin)return json({error:"Nguồn yêu cầu không hợp lệ."},403);
  try{
    if(request.method==="GET"){
      switch(resource){
        case "session":return json({isAdmin:true});
        case "fund-history":return json(await loadFundHistory(z.string().min(1).max(100).parse(query.fundId),z.coerce.number().int().min(1).max(100000).default(1).parse(query.page)));
        case "revision":return json(await loadAdminRevision());
        case "bootstrap":case "funds":return json(await loadAdminBootstrap());
        case "fund-activity": {
          const input=z.object({date:z.string().default(localDate()).refine(value=>!transactionDates(value,value).error,"Ngày thống kê không hợp lệ"),allTime:z.enum(["0","1"]).default("0"),fundId:z.string().max(100).default(""),account:z.string().max(100).default("")}).parse(query);
          return json(await loadFundActivity({...input,allTime:input.allTime==="1"}));
        }
        case "transaction-summary":return json(await loadTransactionSummary());
        case "transactions":return json(await loadAdminTransactions(query));
        case "transfer-details":return json(await loadTransferDetails(z.string().min(1).max(100).parse(query.id)));
        case "transfers":return json(await loadAdminTransfers());
        case "sync":return json(await loadAdminSync(query.log??""));
        case "review-candidates":return json(await loadReviewCandidates(z.string().min(1).max(100).parse(query.id)));
        case "imports":return json(await actions.getFundImportHistory(z.string().min(1).max(100).parse(query.fundId)));
        case "fund-transactions":return json(await actions.getFundTransactions({...query,fundId:query.fundId,page:Number(query.page)||1}));
        case "reclassification":return json(await actions.getLatestReclassification(JSON.parse(query.scope??"{}")));
        default:return json({error:"Không tìm thấy API."},404);
      }
    }
    let result:unknown;
    const form=()=>request.formData();
    switch(`${request.method} ${resource}`){
      case "PATCH funds/visibility":result=await actions.setFundVisibility({},await form());break;
      case "PATCH funds/pin":result=await actions.pinFund({},await form());break;
      case "POST funds":case "PUT funds":result=await actions.saveFund({},await form());break;
      case "POST transactions/assignment":result=await actions.assignTransaction({},await form());break;
      case "POST transactions/assignments":result=await actions.bulkAssignTransactions(await request.json());break;
      case "POST transaction-notes":{const data=await form();result=await actions.saveTransactionNote({},data);break;}
      case "POST public-cache":{
        await queuePublicRefresh();
        return json(await runPublicRefresh(100));
      }
      case "POST transfers/preview":return json(await previewAllocationTransfer(await request.json()));
      case "POST transfers/allocate":result=await actions.createAllocationTransfer(await request.json());break;
      case "POST transfers":result=await actions.createTransfer({},await form());break;
      case "POST transfers/reversal":result=await actions.reverseTransfer({},await form());break;
      case "POST imports":result=await actions.uploadFundExcel({},await form());break;
      case "POST imports/commit":result=await actions.commitFundExcel(await request.json());break;
      case "POST transactions/review":result=await actions.resolveDuplicate({},await form());break;
      case "POST reclassification":result=await actions.startReclassification(await request.json());break;
      case "PATCH reclassification":result=await actions.advanceReclassification(z.object({id:z.string().min(1).max(100),phase:z.enum(["CHECK","APPLY"])}).parse(await request.json()));break;
      default:return json({error:"Phương thức hoặc API không hợp lệ."},405);
    }
    await queuePublicRefresh();
    after(async()=>{await Promise.allSettled([refreshPublicSafely(),dispatchAdminNotificationsSafely()]);});
    return json(result);
  }catch(error){
    if(isAllocationTransferError(error))return json({error:error.message},400);
    if(error instanceof z.ZodError)return json({error:error.issues.map(i=>i.message).join("; ")},400);
    console.error("Admin REST request failed",resource,error instanceof Error?error.name:"unknown");
    return json({error:"Không thể xử lý dữ liệu. Vui lòng thử lại."},500);
  }
}
export const GET=handle;export const POST=handle;export const PUT=handle;export const PATCH=handle;
