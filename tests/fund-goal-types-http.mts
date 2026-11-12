import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { decodeAdmin } from "../src/lib/admin-codec";
const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (url.hostname !== "localhost" || !url.pathname.startsWith("/hvntvn_test_goal")) throw new Error("Isolated goal test database required");
const origin = process.env.QA_ORIGIN ?? "http://localhost:3112";
if (!origin.startsWith("http://localhost:")) throw new Error("Localhost only");
const { db } = await import("../src/lib/db");
if (await db.bankAccount.count()) throw new Error("Empty test database required");
const token = await encode({ token: { email: "qa-admin@example.test", name: "QA admin", sub: "qa" }, secret: process.env.AUTH_SECRET!, salt: "authjs.session-token", maxAge: 3600 });
const cookie = `authjs.session-token=${token}`;
async function save(values: Record<string, string>) {
  const body = new FormData(); for (const [key, value] of Object.entries(values)) body.set(key, value);
  const response = await fetch(origin + "/api/admin/funds", { method: values.id ? "PUT" : "POST", headers: { cookie, origin }, body });
  assert.equal(response.status, 200);
  return decodeAdmin<{ success?: string; error?: string; fieldErrors?: Record<string, string[]> }>(await response.json());
}
try {
  await db.bankAccount.create({ data: { number: "0572", owner: "QA", label: "QA" } });
  const input = { code: `GOAL${randomUUID().slice(0,8).replace(/-/g,"")}`.toUpperCase(), name: "Mục tiêu rộng 3m dài 350m", status: "ACTIVE", keywords: "", description: "", goalType: "LENGTH", goalUnitPrice: "1500000", goalWidth: "3", goalQuantity: "350", goalAmount: "1" };
  assert.ok((await save(input)).success);
  let fund = await db.fund.findUniqueOrThrow({ where: { code: input.code } });
  assert.equal(fund.goalType, "LENGTH"); assert.equal(fund.goalAmount, 525000000n);
  assert.deepEqual(fund.goalConfig, { version: 2, unit: "m", unitPrice: "1500000", width: "3", quantity: "350" });
  const api = await fetch(`${origin}/api/public/funds/${fund.slug}`); assert.equal(api.status, 200);
  const pub = await api.json(); assert.equal(pub.goalType, "LENGTH"); assert.equal(pub.goalAmount, "525000000"); assert.deepEqual(pub.goalConfig, fund.goalConfig);
  const update = { ...input, id: fund.id };
  assert.ok((await save({ ...update, goalQuantity: "12,5" })).success);
  fund = await db.fund.findUniqueOrThrow({ where: { id: fund.id } }); assert.equal(fund.goalAmount, 18750000n);
  const { goalType, goalUnitPrice, goalWidth, goalQuantity, goalAmount, ...legacy } = update; void goalType; void goalUnitPrice; void goalWidth; void goalQuantity; void goalAmount;
  assert.ok((await save(legacy)).success);
  assert.equal((await db.fund.findUniqueOrThrow({ where: { id: fund.id } })).goalType, "LENGTH");
  for (const invalid of [{ goalWidth: "0" }, { goalQuantity: "0" }, { goalUnitPrice: "0" }, { goalQuantity: "1.00001" }, { goalUnitPrice: "999999999999999" }, { goalType: "UNKNOWN" }]) {
    assert.ok((await save({ ...update, ...invalid })).error);
    assert.equal((await db.fund.findUniqueOrThrow({ where: { id: fund.id } })).goalAmount, 18750000n);
  }
  assert.ok((await save({ ...update, goalType: "MONEY", goalAmount: "150000000" })).success);
  fund = await db.fund.findUniqueOrThrow({ where: { id: fund.id } }); assert.equal(fund.goalType, "MONEY"); assert.equal(fund.goalAmount, 150000000n); assert.equal(fund.goalConfig, null);
  assert.ok((await save({ ...update, goalType: "MONEY", goalAmount: "" })).success);
  assert.equal((await db.fund.findUniqueOrThrow({ where: { id: fund.id } })).goalAmount, null);
  const audit = await db.auditLog.findMany({ where: { entityId: fund.id } }); assert.ok(audit.some(a => JSON.stringify(a.details).includes('"width":"3"')));
  assert.equal(await db.bankTransaction.count(), 0);
  console.log("PASS: REST length/money goals, exact per-linear-metre calculation, public config, decimal lengths, forged totals ignored, invalid input rollback, legacy preservation, clear/switch modes, audit and unchanged ledger");
} finally {
  await new Promise(resolve => setTimeout(resolve, 1000));
  await db.auditLog.deleteMany(); await db.fund.deleteMany(); await db.bankAccount.deleteMany(); await db.$disconnect();
}
