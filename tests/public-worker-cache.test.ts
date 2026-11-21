import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {publicCacheResponse} from '../cloudflare/public-cache-response';
import {vietnamMonth} from '../src/lib/domain';

function fixture(){
 const values=new Map<string,unknown>();
 const objects={idFromName:(name:string)=>name,get:()=>({getValue:async(key:string)=>values.get(key)??null,setValue:async()=>{},deleteValue:async()=>{}})};
 const rows=Array.from({length:105},(_,i)=>({id:`row-${i}`,name:'donor',account:'0572',narrative:i===104?'special gift':'public gift',amount:'180000',at:'2026-11-21T00:00:00Z'}));
 const fund={id:'private-fund-id',cutover:'private-cutover',fundingVersion:3,goalAmount:null,goalType:'MONEY',isLongTerm:false,month:'',count:105,rows,balance:'9007199254740993'};
 const snapshot={revision:1,credit:fund,debit:{...fund,rows:[]}};
 const publish=()=>values.set('chunk',JSON.stringify(snapshot));
 values.set('fund:slug',{fundId:fund.id,chunks:['chunk']});values.set(`revision:${fund.id}`,1);publish();
 const env={APP_RUNTIME_CACHE:objects};
 const get=(path='/api/public/funds/slug')=>publicCacheResponse(new Request('https://example.test'+path),env);
 return {get,values,snapshot,publish,env};
}
test('native public cache preserves amounts, public DTO, search and pagination without Next',async()=>{
 const {get}=fixture();
 const response=(await get('/api/public/funds/slug?page=2'))!;
 assert.equal(response.headers.get('X-Public-Path'),'worker-cache');
 const data=await response.json();assert.equal(data.balance,'9007199254740993');
 assert.equal(data.id,undefined);assert.equal(data.cutover,undefined);
 assert.equal(data.page,2);assert.equal(data.rows.length,5);
 const searched=await (await get('/api/public/funds/slug?q=special&page=9'))!.json();
 assert.equal(searched.count,1);assert.equal(searched.page,1);assert.equal(searched.rows[0].id,'row-104');
 assert.equal((await (await get('/api/public/funds/slug?type=DEBIT'))!.json()).rows.length,0);
});
test('revision advances, missing manifests and old months always fall back, including decoded hits',async()=>{
 const {get,values}=fixture();
 assert.ok(await get());values.set('revision:private-fund-id',2);assert.equal(await get(),null);
 values.set('revision:private-fund-id',1);values.delete('fund:slug');assert.equal(await get(),null);
 const other=fixture();other.snapshot.credit.isLongTerm=true;
 other.snapshot.credit.month=vietnamMonth()==='2026-01'?'2025-12':'2026-01';other.publish();
 assert.equal(await other.get(),null);
 const metre=fixture();metre.snapshot.credit.goalType='LENGTH';metre.publish();
 assert.equal(await metre.get(),null,'Old metre-goal configuration is rejected');
});
test('native cache never intercepts admin, writes, aliases, or malformed/missing entries',async()=>{
 const {get,env,values}=fixture();
 for(const path of ['/api/admin/funds','/api/public/funds/0572-tdts','/api/public/funds/slug/recognition','/api/public/funds/%73lug'])assert.equal(await get(path),null);
 assert.equal(await publicCacheResponse(new Request('https://example.test/api/public/funds/slug',{method:'POST'}),env),null);
 values.set('chunk','malformed json');assert.equal(await get(),null);
});
test('public cache path bundles no Next.js, authentication, PostgreSQL or Excel runtime',async()=>{
 const bundle=await build({entryPoints:['cloudflare/public-cache-response.ts'],bundle:true,platform:'browser',format:'esm',write:false,metafile:true});
 const inputs=Object.keys(bundle.metafile!.inputs);
 assert.equal(inputs.some(path=>/node_modules\/(next|next-auth|pg|exceljs|@prisma)\//.test(path)||path.endsWith('/lib/db.ts')),false,inputs.join('\n'));
});
