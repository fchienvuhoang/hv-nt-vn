import 'server-only';
import {AsyncLocalStorage} from 'node:async_hooks';
import {getCache} from '@vercel/functions';
type Metric={flow:string;at:number;queries:number;durationMs:number};
const context=new AsyncLocalStorage<Metric>();
export function countDatabaseQuery(){const value=context.getStore();if(value)value.queries++;}
export async function measureOperations<T>(flow:string,work:()=>Promise<T>,defer?:(work:()=>Promise<void>)=>void):Promise<T>{
 const metric:Metric={flow,at:Date.now(),queries:0,durationMs:0};
 return context.run(metric,async()=>{try{return await work();}finally{
  metric.durationMs=Date.now()-metric.at;
  console.info('database-operations',JSON.stringify(metric));
  // Per-flow time slots avoid read/modify/write races and contain no SQL or donor data.
  const persist=async()=>{try{await getCache({namespace:'hvntvn-operation-metrics-v1'}).set(`${flow}:${Math.floor(metric.at/60000)%200}`,metric,{ttl:86400});}catch{/* Telemetry cannot fail money processing. */}};
  if(defer)defer(persist);else await persist;
 }});
}
