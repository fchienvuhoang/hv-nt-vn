import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { decodeAdmin } from "../src/lib/admin-codec";
const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (url.hostname !== "localhost" || !url.pathname.startsWith("/hvntvn_test_split")) throw new Error("Require isolated split database");
const origin = process.env.QA_ORIGIN ?? "http://localhost:3107";
if (!origin.startsWith("http://localhost:")) throw new Error("Localhost only");
const { db } = await import("../src/lib/db");
if (await db.bankAccount.count()) throw new Error("Require empty database");
const token = await encode({ token: { email: "qa-admin@example.test", name: "QA admin", sub: "qa" }, secret: process.env.AUTH_SECRET!, salt: "authjs.session-token", maxAge: 3600 });
const cookie = `authjs.session-token=${token}`;
const account = await db.bankAccount.create({ data: { number: "0572", owner: "QA", label: "QA" } });
const funds = await Promise.all(["HTTPA", "HTTPB"].map(code => db.fund.create({ data: { code, slug: `${code.toLowerCase()}-${randomUUID()}`, accountId: account.id, name: code, keywords: [], publicListed: true } })));
const row = await db.bankTransaction.create({ data: { accountId: account.id, sourceId: randomUUID(), refId: "SPLIT-HTTP", direction: "CREDIT", amount: 1000000n, narrative: "Chia hùn phước 0912345678", displayName: "QA", occurredAt: new Date(), sourceHash: "QA", source: { test: true } } });
const body = { requestId: randomUUID(), transactionId: row.id, updatedAt: row.updatedAt.toISOString(), reason: "Theo yêu cầu thí chủ 0987654321", shares: [{ fundId: funds[0].id, amount: "600000" }, { fundId: funds[1].id, amount: "400000" }] };
async function split(auth = true, source = origin, input = body) {
  return fetch(origin + "/api/admin/transactions/split", { method: "POST", headers: { "content-type": "application/json", origin: source, ...(auth ? { cookie } : {}) }, body: JSON.stringify(input) });
}
try {
  assert.equal((await split(false)).status, 401);
  assert.equal((await split(true, "https://untrusted.test")).status, 403);
  const response = await split(); assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type")!, /application\/json/);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.ok((await response.json()).success);
  assert.ok((await (await split()).json()).success);
  assert.equal(await db.transactionNote.count({ where: { kind: "DIRECT_SPLIT" } }), 1);
  assert.equal((await db.auditLog.findFirstOrThrow({ where: { action: "TRANSACTION_SPLIT" } })).actorId, "qa");
  for (const [index, fund] of funds.entries()) {
    const pub = await fetch(`${origin}/api/public/funds/${fund.slug}`); assert.equal(pub.status, 200);
    const text = await pub.text(), data = JSON.parse(text);
    assert.equal(data.rows.length, 1);
    assert.equal(data.rows[0].amount, index === 0 ? "600000" : "400000");
    assert.equal(data.rows[0].originalAmount, "1000000");
    assert.equal(data.income, data.rows[0].amount);
    assert.equal(data.goalIncome, data.rows[0].amount);
    for (const secret of ["0912345678", "0987654321", "qa-admin@example.test"]) assert.ok(!text.includes(secret));
    const scoped = await fetch(`${origin}/api/admin/transactions?fund=${fund.id}`, { headers: { cookie } });
    const result = decodeAdmin<{ rows: { amount: bigint; originalAmount: bigint }[] }>(await scoped.json());
    assert.equal(result.rows[0].amount, index === 0 ? 600000n : 400000n);
    assert.equal(result.rows[0].originalAmount, 1000000n);
  }
  const admin = await fetch(origin + "/admin?view=transactions", { headers: { cookie } }); assert.equal(admin.status, 200);
  const html = await admin.text(); assert.ok(!html.includes("Build Error"));
  const current = await db.bankTransaction.findUniqueOrThrow({ where: { id: row.id } });
  const invalid = await split(true, origin, { ...body, requestId: randomUUID(), updatedAt: current.updatedAt.toISOString(), shares: [{ fundId: funds[0].id, amount: "1" }, { fundId: funds[1].id, amount: "1" }] });
  assert.match((await invalid.json()).error, /bằng đúng/);
  assert.equal(await db.fundAllocation.count(), 2);
  const transfer={fromFundId:funds[1].id,toFundId:funds[0].id,mode:"AMOUNT",value:"10000",reason:"Chuyển sau khi chia trực tiếp"};
  const call=async(path:string,input:object)=>fetch(origin+"/api/admin/"+path,{method:"POST",headers:{cookie,origin,"content-type":"application/json"},body:JSON.stringify(input)});
  const preview=await(await call("transfers/preview",transfer)).json();
  assert.ok((await(await call("transfers/allocate",{...transfer,requestId:randomUUID(),fingerprint:preview.fingerprint})).json()).success);
  for(const [index,fund]of funds.entries()){
    const data=await(await fetch(`${origin}/api/public/funds/${fund.slug}`)).json();
    assert.equal(data.rows[0].amount,index===0?"600000":"400000");
    assert.equal(data.goalIncome,index===0?"610000":"390000");
  }
  console.log("PASS: authenticated JSON split API, same-origin checks, idempotent retries, actor identity, public allocated amounts and masked data, admin original/scoped amounts, CSS compilation, invalid-total rollback");
} finally {
  // Cache refresh is queued with Next after(); allow that local work to finish before fixture cleanup.
  await new Promise(resolve => setTimeout(resolve, 1000));
  await db.transfer.deleteMany({where:{reversalOf:{not:null}}});await db.transfer.deleteMany();
  await db.auditLog.deleteMany(); await db.bankTransaction.deleteMany(); await db.fund.deleteMany(); await db.bankAccount.deleteMany(); await db.$disconnect();
}
