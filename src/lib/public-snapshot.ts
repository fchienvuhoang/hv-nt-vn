import {VersionedJsonCache} from "./versioned-json-cache";
import {localDate,vietnamMonth} from "./domain";
export {vietnamMonth} from "./domain";
import {measureOperations} from "./operation-metrics";
import "server-only";
import {getCache} from "@vercel/functions";
import {randomUUID} from "node:crypto";
import {revalidateTag} from "next/cache";
import {db} from "./db";
import {publicFund,publicFundDTO,publicTransactionPage,PUBLIC_PAGE_SIZE} from "./public-data";
import {publicFundTag} from "./cache-tags";
import {publicSearchText,publicSearchTerms,matchesPublicSearchText} from "./public-search";
export type PublicSnapshot={revision?:number;searchIndex?:{credit:string[];debit:string[]};credit:NonNullable<Awaited<ReturnType<typeof publicFund>>>;debit:NonNullable<Awaited<ReturnType<typeof publicFund>>>};
const cache=()=>getCache({namespace:"hvntvn-public-snapshot-v1"});
const key=(slug:string)=>`fund:${slug}`;
const decodedSnapshots=new VersionedJsonCache<PublicSnapshot>(8*1024*1024,16);
class SnapshotChangedError extends Error {}
async function buildSnapshotOnce(slug:string):Promise<PublicSnapshot|null>{
 const identity=await db.fund.findUnique({where:{slug},select:{id:true}});if(!identity)return null;
 const revision=(await db.publicCacheRefresh.findUnique({where:{fundId:identity.id},select:{requestedVersion:true}}))?.requestedVersion??0;
 revalidateTag(publicFundTag(identity.id),{expire:0});
 // Read summaries once, not once per historical page over the remote cache.
 const firstCredit=await publicFund(slug,1,"CREDIT");if(!firstCredit)return null;
 const firstDebit={...firstCredit,count:firstCredit.counts.DEBIT,page:1,rows:await publicTransactionPage(firstCredit.id,"DEBIT",1,firstCredit.month)};
 const credit={...firstCredit,rows:[...firstCredit.rows]},debit={...firstDebit,rows:[...firstDebit.rows]};
 const pages: {fund:typeof credit;direction:"CREDIT"|"DEBIT";page:number}[]=[];
 for(const [fund,direction] of [[credit,"CREDIT"],[debit,"DEBIT"]] as const){
   for(let page=2;page<=Math.ceil(fund.count/PUBLIC_PAGE_SIZE);page++)pages.push({fund,direction,page});
 }
 // Bound database pressure and preserve page order across parallel reads.
 for(let i=0;i<pages.length;i+=3){
   const batch=pages.slice(i,i+3);
   const rows=await Promise.all(batch.map(({fund,direction,page})=>publicTransactionPage(fund.id,direction,page,fund.month)));
   for(let j=0;j<batch.length;j++)batch[j].fund.rows.push(...rows[j]);
 }
 const latest=(await db.publicCacheRefresh.findUnique({where:{fundId:identity.id},select:{requestedVersion:true}}))?.requestedVersion??0;
 if(latest!==revision)throw new SnapshotChangedError("Ledger changed while building snapshot");
 return credit&&debit?{revision,credit,debit,searchIndex:{credit:credit.rows.map(publicSearchText),debit:debit.rows.map(publicSearchText)}}:null;
}
async function buildSnapshot(slug:string):Promise<PublicSnapshot|null>{return measureOperations("public-build",()=>buildMeasuredSnapshot(slug));}
async function buildMeasuredSnapshot(slug:string):Promise<PublicSnapshot|null>{
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
 // The shared manifest and revision remain authoritative on every request.
 const version=JSON.stringify(manifest.chunks);
 let snapshot=decodedSnapshots.get(slug,version);
 if(!snapshot){
   const parts=await Promise.all(manifest.chunks.map(name=>store.get(name) as Promise<string|null>));if(parts.some(p=>p===null))return null;
   const json=parts.join("");snapshot=JSON.parse(json) as PublicSnapshot;
   decodedSnapshots.set(slug,version,snapshot,Buffer.byteLength(json,"utf8"));
 }
 const revision=await store.get(`revision:${snapshot.credit.id}`) as number|null;
 if(revision!==null&&(snapshot.revision??0)<revision)return null;
 if (snapshot.credit.fundingVersion!==3 || snapshot.debit.fundingVersion!==3) return null;
 if (!("goalAmount" in snapshot.credit) || !("goalAmount" in snapshot.debit)) return null;
 // Reject metre targets cached with the former area-price calculation.
 for(const fund of [snapshot.credit,snapshot.debit])if(fund.goalType==="LENGTH"&&(!fund.goalConfig||typeof fund.goalConfig!=="object"||!("version" in fund.goalConfig)||fund.goalConfig.version!==2))return null;
 // Never disclose the previous month's rows, even if a daily warmup has not finished yet.
 if(snapshot.credit.isLongTerm&&snapshot.credit.month!==vietnamMonth())return null;
 return snapshot;
}
export async function snapshotResponse(slug:string,page:number,direction:"CREDIT"|"DEBIT",search:string){
 let snapshot=await readPublicSnapshot(slug);const hit=!!snapshot;
 if(!snapshot&&!search.trim()){
   // First-page visitors must not wait for a full historical snapshot rebuild.
   const pageKey=JSON.stringify([slug,page,direction]);
   let loading=coldPages.get(pageKey);
   if(!loading){loading=loadFreshPublicPage(slug,page,direction);coldPages.set(pageKey,loading);}
   try{const fund=await loading;return fund?{hit:false,data:publicFundDTO(fund)}:null;}
   finally{if(coldPages.get(pageKey)===loading)coldPages.delete(pageKey);}
 }
 if(!snapshot)snapshot=await warmPublicSnapshot(slug);
 if(!snapshot)return null;
 const fund=direction==="CREDIT"?snapshot.credit:snapshot.debit;
 const terms=publicSearchTerms(search),index=direction==="CREDIT"?snapshot.searchIndex?.credit:snapshot.searchIndex?.debit;
 const rows=terms.length?fund.rows.filter((row,i)=>matchesPublicSearchText(index?.[i]??publicSearchText(row),terms)):fund.rows;
 const currentPage=Math.min(Math.max(1,Math.floor(page)||1),Math.max(1,Math.ceil(rows.length/PUBLIC_PAGE_SIZE)));
 return {hit,data:publicFundDTO({...fund,page:currentPage,count:rows.length,rows:rows.slice((currentPage-1)*PUBLIC_PAGE_SIZE,currentPage*PUBLIC_PAGE_SIZE)})};
}
const coldLoads=new Map<string,Promise<PublicSnapshot|null>>();
const coldPages=new Map<string,ReturnType<typeof loadFreshPublicPage>>();
async function loadFreshPublicPage(slug:string,page:number,direction:"CREDIT"|"DEBIT"){
 const identity=await db.fund.findUnique({where:{slug},select:{id:true}});if(!identity)return null;
 for(let attempt=0;attempt<3;attempt++){
   const revision=(await db.publicCacheRefresh.findUnique({where:{fundId:identity.id},select:{requestedVersion:true}}))?.requestedVersion??0;
   revalidateTag(publicFundTag(identity.id),{expire:0});
   const fund=await publicFund(slug,page,direction);
   const latest=(await db.publicCacheRefresh.findUnique({where:{fundId:identity.id},select:{requestedVersion:true}}))?.requestedVersion??0;
   if(latest===revision)return fund;
 }
 throw new SnapshotChangedError("Ledger changed while reading public page");
}
/** Warm immutable history after the response, sharing concurrent work per slug. */
export async function warmPublicSnapshot(slug:string){
 const existing=coldLoads.get(slug);if(existing)return existing;
 const loading=(async()=>{
   const current=await readPublicSnapshot(slug);if(current)return current;
   const data=await buildSnapshot(slug);if(data)await publish(slug,data);return data;
 })();
 coldLoads.set(slug,loading);
 try{return await loading;}finally{if(coldLoads.get(slug)===loading)coldLoads.delete(slug);}
}
export async function queuePublicRefresh(ids?:string[]){
 const funds=ids?ids.map(id=>({id})):await db.fund.findMany({select:{id:true}});
 if(!funds.length)return;
 await db.$transaction(async tx=>{
   await tx.publicCacheRefresh.createMany({data:funds.map(f=>({fundId:f.id,requestedVersion:0})),skipDuplicates:true});
   await tx.publicCacheRefresh.updateMany({where:{fundId:{in:funds.map(f=>f.id)}},data:{requestedVersion:{increment:1},requestedAt:new Date()}});
 });
 const states=await db.publicCacheRefresh.findMany({where:{fundId:{in:funds.map(f=>f.id)}},select:{fundId:true,requestedVersion:true}});
 await Promise.all(states.map(s=>cache().set(`revision:${s.fundId}`,s.requestedVersion,{ttl:7*86400})));
}
export async function runPublicRefresh(limit=2){return measureOperations("public-worker",()=>runMeasuredRefresh(limit));}
async function runMeasuredRefresh(limit:number){
 const token=randomUUID(),deadline=Date.now()+240000;
 const day=localDate();
 const [work]=await db.$queryRaw<{needed:boolean}[]>`SELECT EXISTS (
   SELECT 1 FROM "Fund" f LEFT JOIN "PublicCacheRefresh" r ON r."fundId"=f.id
   WHERE (f.status='ACTIVE' AND (r."dailyKey" IS NULL OR r."dailyKey"<>${day}))
      OR r."requestedVersion">r."builtVersion"
 ) AS needed`;
 if(!work.needed)return {busy:false,built:0,pending:0};
 const lock=await db.$executeRaw`INSERT INTO "SyncLease" (id,token,"expiresAt") VALUES ('public-snapshot',${token},(NOW() AT TIME ZONE 'UTC')+INTERVAL '300 seconds') ON CONFLICT (id) DO UPDATE SET token=EXCLUDED.token,"expiresAt"=EXCLUDED."expiresAt" WHERE "SyncLease"."expiresAt" < (NOW() AT TIME ZONE 'UTC')`;
 if(!lock)return {busy:true,built:0};
 let built=0;
 try{
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
