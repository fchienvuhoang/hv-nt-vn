import {readFile,writeFile,unlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const worker=process.env.CLOUDFLARE_BUILD==='1';
const schema='prisma/schema.cloudflare.prisma';
try {
 if(worker){
  const original=await readFile('prisma/schema.prisma','utf8');
  await writeFile(schema,original.replace(/(generator client\s*\{)/,'$1\n  runtime = "cloudflare"'));
 }
 const result=spawnSync(process.execPath,['node_modules/prisma/build/index.js','generate',...(worker?['--schema',schema]:[])],{stdio:'inherit',env:process.env});
 if(result.error)throw result.error;
 process.exitCode=result.status??1;
}finally{if(worker)await unlink(schema).catch(()=>{});}
