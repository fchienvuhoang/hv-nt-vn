// Explicitly preload only in the isolated localhost QA server. Never imported by the app.
const url=new URL(process.env.DATABASE_URL??"postgresql://invalid/invalid");
if(url.hostname!=="localhost"||!url.pathname.startsWith("/hvntvn_test"))throw new Error("Mock bank requires test database");
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);
 if(url.hostname!=="api-pilot.thiennguyen.app")return originalFetch(input,init);
 const number=url.pathname.endsWith("/transactionsV2")?url.pathname.split("/").at(-2):url.searchParams.get("accountNo");
 const first=number==="0572";
 if(url.pathname.endsWith("/transactionsV2"))return Response.json({status:200,data:{accountNumber:number,username:first?"hvnguyenthuyvnhotritambao":"hvnguyenthuyvnphungsucongdong",userId:first?"2020856147493257216":"2011680198621147136",totalCredit:10000,totalDebit:0}});
 const page=Number(url.searchParams.get("page")),date=url.searchParams.get("fromDate"),direction=url.searchParams.get("type");
 const items=first&&direction==="CREDIT"&&page===1?[{id:"HOOK-A",bankAccountId:"2028140453689352192",refId:"HOOK-A",transactionAmount:2000,type:"CREDIT",narrative:"TPCA FRESHHOOK",displayName:"TEST",transactionTime:`${date}T10:00:00`}]:[];
 return Response.json({status:200,data:{total:items.length,page,items}});
};
