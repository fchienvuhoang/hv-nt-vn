import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';

test('Workers Prisma clients belong to one execution context; Node keeps a lazy singleton',()=>{
 let context:object|undefined,created=0;const configs:Record<string,unknown>[]=[];
 class PrismaPg{constructor(config:Record<string,unknown>){configs.push(config)}}
 class PrismaClient{identity=++created;$extends(){return this}$disconnect(){return this.identity}fund={}}
 const exports={} as typeof import('../src/lib/db');
 const modules:Record<string,unknown>={'server-only':{},'./operation-metrics':{countDatabaseQuery:()=>{}},'@/generated/prisma/client':{PrismaClient},'@prisma/adapter-pg':{PrismaPg},'./database-url':{databaseConnectionString:(s:string)=>s},'./cloudflare-context':{cloudflareContext:()=>context?{ctx:context}:undefined}};
 vm.runInNewContext(ts.transpile(readFileSync('src/lib/db.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),{exports,process:{env:{NODE_ENV:'production',DATABASE_URL:'postgresql://test'}},require:(id:string)=>{if(!(id in modules))throw Error(id);return modules[id]}});
 assert.equal(created,0,'No DB I/O or client at module initialization');
 const first={};context=first;assert.equal(exports.db.$disconnect(),1);assert.equal(exports.db.$disconnect(),1);
 context={};assert.equal(exports.db.$disconnect(),2);context=first;assert.equal(exports.db.$disconnect(),1);
 assert.equal(configs[0].maxUses,1);assert.equal(configs[1].maxUses,1);
 context=undefined;assert.equal(exports.db.$disconnect(),3);assert.equal(exports.db.$disconnect(),3);assert.equal(configs[2].maxUses,undefined);
});
