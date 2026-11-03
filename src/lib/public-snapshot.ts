import "server-only";
import {getCache} from "@vercel/functions";
import {randomUUID} from "node:crypto";
import {revalidateTag} from "next/cache";
import {db} from "./db";
import {publicFund,publicFundDTO,PUBLIC_PAGE_SIZE} from "./public-data";
import {publicFundTag} from "./cache-tags";
import {publicSearchText,publicSearchTerms,matchesPublicSearchText} from "./public-search";
export type PublicSnapshot={revision?:number;searchIndex?:{credit:string[];debit:string[]};credit:NonNullable<Awaited<ReturnType<typeof publicFund>>>;debit:NonNullable<Awaited<ReturnType<typeof publicFund>>>};
const cache=()=>getCache({namespace:"hvntvn-public-snapshot-v1"});
const key=(slug:string)=>`fund:${slug}`;
export function vietnamMonth(){return new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit"}).format(new Date());}
class SnapshotChangedError extends Error {}
async function buildSnapshotOnce(slug:string):Promise<PublicSnapshot|null>{
 const identity=await db.fund.findUnique({where:{slug},select:{id:true}});if(!identity)return null;
 const revision=(await db.publicCacheRefresh.findUnique({where:{fundId:identity.id},select:{requestedVersion:true}}))?.requestedVersion??0;
 revalidateTag(publicFundTag(identity.id),{expire:0});
 const load=async(direction:"CREDIT"|"DEBIT")=>{
   const first=await publicFund(slug,1,direction);if(!first)return null;
   const rows=[...first.rows];
   for(let page=2;page<=Math.ceil(first.count/PUBLIC_PAGE_SIZE);page++){
     const data=await publicFund(slug,page,direction);if(!data)throw new Error("Fund disappeared during cache refresh");rows.push(...data.rows);
   }
   return {...first,rows};
 };
 const credit=await load("CREDIT"),debit=await load("DEBIT");
 const latest=(await db.publicCacheRefresh.findUnique({where:{fundId:identity.id},select:{requestedVersion:true}}))?.requestedVersion??0;
 if(latest!==revision)throw new SnapshotChangedError("Ledger changed while building snapshot");
 return credit&&debit?{revision,credit,debit,searchIndex:{credit:credit.rows.map(publicSearchText),debit:debit.rows.map(publicSearchText)}}:null;
}
async function buildSnapshot(slug:string):Promise<PublicSnapshot|null>{
 for(let attempt=0;;attempt++)try{return await buildSnapshotOnce(slug)}catch(error){if(!(error instanceof SnapshotChangedError)||attempt>=2)throw error;}
}
/** Publish immutable chunks first, then atomically swap the manifest. Readers retain the old complete version. */
async function publish(slug:string,snapshot:PublicSnapshot){
 const store=cache(),version=randomUUID(),json=JSON.stringify(snapshot),chunks:string[]=[];
 // Split by characters conservatively so UTF-8 payloads stay below Vercel's 2MB limit.
 for(let offset=0;offset<json.length;offset+=180000)chunks.push(json.slice(offset,offset+180000));
 const names=chunks.map((_,index)=>`${key(slug)}:${version}:${index}`);
 for(let i=0;i<chunks.length;i++)await store.set(names[i],chunks[i],{ttl:7*86400});
 await store.set(key(slug),{chunks:names},{ttl:6*86400});
}
export async function readPublicSnapshot(slug:string){
 const store=cache(),manifest=await store.get(key(slug)) as {chunks:string[]}|null;if(!manifest)return null;
 const parts=await Promise.all(manifest.chunks.map(name=>store.get(name) as Promise<string|null>));if(parts.some(p=>p===null))return null;
 const snapshot=JSON.parse(parts.join("")) as PublicSnapshot;
 const state=await db.publicCacheRefresh.findUnique({where:{fundId:snapshot.credit.id},select:{requestedVersion:true}});
 if(snapshot.revision!==(state?.requestedVersion??0))return null;
 if (snapshot.credit.fundingVersion!==1 || snapshot.debit.fundingVersion!==1) return null;
 if (!("goalAmount" in snapshot.credit) || !("goalAmount" in snapshot.debit)) return null;
 // Never disclose the previous month's rows, even if a daily warmup has not finished yet.
 if(snapshot.credit.isLongTerm&&snapshot.credit.month!==vietnamMonth())return null;
 return snapshot;
}
export async function snapshotResponse(slug:string,page:number,direction:"CREDIT"|"DEBIT",search:string){
 let snapshot=await readPublicSnapshot(slug);const hit=!!snapshot;
 if(!snapshot){
   const loading=coldLoads.get(slug)??(async()=>{const data=await buildSnapshot(slug);if(data)await publish(slug,data);return data;})();
   coldLoads.set(slug,loading);try{snapshot=await loading;}finally{coldLoads.delete(slug);}
 }
 if(!snapshot)return null;
 const fund=direction==="CREDIT"?snapshot.credit:snapshot.debit;
 const terms=publicSearchTerms(search),index=direction==="CREDIT"?snapshot.searchIndex?.credit:snapshot.searchIndex?.debit;
 const rows=terms.length?fund.rows.filter((row,i)=>matchesPublicSearchText(index?.[i]??publicSearchText(row),terms)):fund.rows;
 const currentPage=Math.min(Math.max(1,Math.floor(page)||1),Math.max(1,Math.ceil(rows.length/PUBLIC_PAGE_SIZE)));
 return {hit,data:publicFundDTO({...fund,page:currentPage,count:rows.length,rows:rows.slice((currentPage-1)*PUBLIC_PAGE_SIZE,currentPage*PUBLIC_PAGE_SIZE)})};
}
const coldLoads=new Map<string,Promise<PublicSnapshot|null>>();
export async function queuePublicRefresh(ids?:string[]){
 const funds=ids?ids.map(id=>({id})):await db.fund.findMany({select:{id:true}});
 if(!funds.length)return;
 await db.$transaction(async tx=>{
   await tx.publicCacheRefresh.createMany({data:funds.map(f=>({fundId:f.id,requestedVersion:0})),skipDuplicates:true});
   await tx.publicCacheRefresh.updateMany({where:{fundId:{in:funds.map(f=>f.id)}},data:{requestedVersion:{increment:1},requestedAt:new Date()}});
 });
}
export async function runPublicRefresh(limit=2){
 const token=randomUUID(),deadline=Date.now()+240000;
 const lock=await db.$executeRaw`INSERT INTO "SyncLease" (id,token,"expiresAt") VALUES ('public-snapshot',${token},(NOW() AT TIME ZONE 'UTC')+INTERVAL '300 seconds') ON CONFLICT (id) DO UPDATE SET token=EXCLUDED.token,"expiresAt"=EXCLUDED."expiresAt" WHERE "SyncLease"."expiresAt" < (NOW() AT TIME ZONE 'UTC')`;
 if(!lock)return {busy:true,built:0};
 let built=0;
 try{
   const now=new Date(),day=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Ho_Chi_Minh"}).format(now);
   const funds=await db.fund.findMany({select:{id:true,slug:true,status:true}});
   // The existing minute webhook drains this durable queue, including daily reconciliation.
   const states=await db.publicCacheRefresh.findMany();
   const daily=funds.filter(f=>f.status==="ACTIVE"&&!states.some(s=>s.fundId===f.id&&s.dailyKey===day));
   if(daily.length){await queuePublicRefresh(daily.map(f=>f.id));await db.publicCacheRefresh.updateMany({where:{fundId:{in:daily.map(f=>f.id)}},data:{dailyKey:day}});}
   const pending=await db.publicCacheRefresh.findMany({orderBy:{requestedAt:"asc"}});
   for(const item of pending.filter(s=>s.requestedVersion>s.builtVersion).slice(0,limit)){
     if(Date.now()>deadline)break;
     const fund=funds.find(f=>f.id===item.fundId);if(!fund)continue;
     try{
       revalidateTag(publicFundTag(fund.id),{expire:0});
       const snapshot=await buildSnapshot(fund.slug);if(!snapshot)throw new Error("Fund not found");
       const latest=await db.publicCacheRefresh.findUnique({where:{fundId:fund.id}});
       if(latest?.requestedVersion!==item.requestedVersion)continue;
       await publish(fund.slug,snapshot);
       if(item.lastSlug&&item.lastSlug!==fund.slug)await cache().delete(key(item.lastSlug));
       await db.publicCacheRefresh.update({where:{fundId:fund.id},data:{builtVersion:item.requestedVersion,builtAt:new Date(),lastSlug:fund.slug,error:null}});built++;
     }catch{await db.publicCacheRefresh.update({where:{fundId:item.fundId},data:{error:"Không tạo được cache, sẽ thử lại lượt tiếp theo"}});}
   }
   return {busy:false,built,pending:await db.publicCacheRefresh.count({where:{requestedVersion:{gt:db.publicCacheRefresh.fields.builtVersion}}})};
 }finally{await db.syncLease.deleteMany({where:{id:"public-snapshot",token}});}
}
export async function refreshPublicSafely(){try{await runPublicRefresh(100);}catch{console.error("Public snapshot refresh failed; previous cache retained");}}
