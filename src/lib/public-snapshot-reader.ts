import {VersionedJsonCache} from "./versioned-json-cache";
import {vietnamMonth} from "./domain";
import {publicSearchText,publicSearchTerms,matchesPublicSearchText} from "./public-search";
import {publicFundDTO,PUBLIC_PAGE_SIZE} from "./public-fund-dto";
import type {PublicSnapshot} from "./public-snapshot";
import type {RuntimeCache} from "./runtime-cache";

// Shared by the REST route and the Worker cache path. No Next.js or DB runtime imports.
export function createPublicSnapshotReader(getStore:()=>RuntimeCache){
 const decodedSnapshots=new VersionedJsonCache<PublicSnapshot>(8*1024*1024,16);
 const snapshotIdentities=new Map<string,string>();
 const key=(slug:string)=>`fund:${slug}`;
return async function readPublicSnapshot(slug:string){
 const store=getStore(),knownId=snapshotIdentities.get(slug);
 // Fetch the authoritative manifest and revision together on a warm read.
 const [manifest,knownRevision]=await Promise.all([
  store.get(key(slug)) as Promise<{fundId?:string;chunks:string[]}|null>,
  knownId?store.get(`revision:${knownId}`) as Promise<number|null>:Promise.resolve(null),
 ]);
 if(!manifest)return null;
 const version=JSON.stringify(manifest.chunks);
 const revisionPromise=manifest.fundId&&manifest.fundId!==knownId?store.get(`revision:${manifest.fundId}`) as Promise<number|null>:Promise.resolve(knownRevision);
 let snapshot=decodedSnapshots.get(slug,version);
 // Observe rejection immediately even while immutable chunks are loading.
 const [loaded,earlyRevision]=await Promise.all([
  snapshot?Promise.resolve(snapshot):Promise.all(manifest.chunks.map(name=>store.get(name) as Promise<string|null>)).then(parts=>{
   if(parts.some(p=>p===null))return null;
   const json=parts.join("");const value=JSON.parse(json) as PublicSnapshot;
   decodedSnapshots.set(slug,version,value,new TextEncoder().encode(json).byteLength);return value;
  }),
  revisionPromise,
 ]);
 if(!loaded)return null;snapshot=loaded;
 const revision=(manifest.fundId??knownId)===snapshot.credit.id?earlyRevision:await store.get(`revision:${snapshot.credit.id}`) as number|null;
 snapshotIdentities.delete(slug);snapshotIdentities.set(slug,snapshot.credit.id);
 if(snapshotIdentities.size>16)snapshotIdentities.delete(snapshotIdentities.keys().next().value!);
 if(revision!==null&&(snapshot.revision??0)<revision)return null;
 if (snapshot.credit.fundingVersion!==3 || snapshot.debit.fundingVersion!==3) return null;
 if (!("goalAmount" in snapshot.credit) || !("goalAmount" in snapshot.debit)) return null;
 // Reject metre targets cached with the former area-price calculation.
 for(const fund of [snapshot.credit,snapshot.debit])if(fund.goalType==="LENGTH"&&(!fund.goalConfig||typeof fund.goalConfig!=="object"||!("version" in fund.goalConfig)||fund.goalConfig.version!==2))return null;
 // Never disclose the previous month's rows, even if a daily warmup has not finished yet.
 if(snapshot.credit.isLongTerm&&snapshot.credit.month!==vietnamMonth())return null;
 return snapshot;
}
}
export function snapshotPage(snapshot:PublicSnapshot,page:number,direction:"CREDIT"|"DEBIT",search:string,hit=true){
 const fund=direction==="CREDIT"?snapshot.credit:snapshot.debit;
 const terms=publicSearchTerms(search),index=direction==="CREDIT"?snapshot.searchIndex?.credit:snapshot.searchIndex?.debit;
 const rows=terms.length?fund.rows.filter((row,i)=>matchesPublicSearchText(index?.[i]??publicSearchText(row),terms)):fund.rows;
 const currentPage=Math.min(Math.max(1,Math.floor(page)||1),Math.max(1,Math.ceil(rows.length/PUBLIC_PAGE_SIZE)));
 return {hit,data:publicFundDTO({...fund,page:currentPage,count:rows.length,rows:rows.slice((currentPage-1)*PUBLIC_PAGE_SIZE,currentPage*PUBLIC_PAGE_SIZE)})};
}
