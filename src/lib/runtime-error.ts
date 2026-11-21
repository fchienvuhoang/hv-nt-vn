/** Connectivity diagnostics only: never log SQL, arguments, credentials or donor data. */
export function runtimeErrorDetails(error:unknown){
 const details:{name?:string;code?:string;message?:string}[]=[];
 const seen=new Set<unknown>();
 function visit(value:unknown,depth=0){
  if(!value||typeof value!=='object'||seen.has(value)||depth>5)return;seen.add(value);
  const e=value as Record<string,unknown>;
  const raw=typeof e.message==='string'?e.message:typeof e.originalMessage==='string'?e.originalMessage:'';
  let message:string|undefined;
  if(/DATABASE_URL.*missing|missing.*DATABASE_URL/i.test(raw))message='DATABASE_URL is missing from runtime';
  else if(/certificate|self.signed|ssl|tls/i.test(raw))message='Database TLS/certificate negotiation failed';
  else if(/password|authentication|sasl/i.test(raw))message='Database authentication failed';
  else if(/timed?\s*out|timeout/i.test(raw))message='Database connection timed out';
  else if(/connection refused|ECONNREFUSED/i.test(raw))message='Database connection refused';
  else if(/resolve|ENOTFOUND|EAI_AGAIN/i.test(raw))message='Database hostname resolution failed';
  else if(/wasm|webassembly/i.test(raw))message='Database runtime WebAssembly error';
  else if(/binding/i.test(raw))message='Worker resource binding unavailable';
  const name=typeof e.name==='string'?e.name:typeof e.kind==='string'?e.kind:undefined;
  const code=typeof e.code==='string'?e.code:typeof e.originalCode==='string'?e.originalCode:undefined;
  if(name||code||message)details.push({name,code,message});
  visit(e.cause,depth+1);
  if(e.meta&&typeof e.meta==='object')visit((e.meta as Record<string,unknown>).driverAdapterError,depth+1);
 }
 visit(error);
 return details.length?details:[{message:'Unknown runtime error'}];
}
