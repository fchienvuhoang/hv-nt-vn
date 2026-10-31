import assert from "node:assert/strict";
const testUrl = new URL(
  process.env.DATABASE_URL ?? "postgresql://invalid/invalid",
);
if (
  !["localhost", "127.0.0.1"].includes(testUrl.hostname) ||
  !testUrl.pathname.startsWith("/hvntvn_test")
)
  throw new Error("Require isolated localhost hvntvn_test database");
const { db } = await import("../src/lib/db");
const { encode } = await import("next-auth/jwt");
const origin = process.env.QA_ORIGIN ?? "http://localhost:3001";
if (!origin.startsWith("http://localhost:"))
  throw new Error("QA is localhost only");
if (!process.env.AUTH_SECRET)
  throw new Error("Set a test-only AUTH_SECRET matching the QA server");
const qaToken = await encode({
  token: { email: "qa-admin@example.test", name: "QA admin", sub: "qa" },
  secret: process.env.AUTH_SECRET,
  salt: "authjs.session-token",
  maxAge: 3600,
});
const cookie = `authjs.session-token=${qaToken}`;
const decode = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
async function get(path: string, auth = true) {
  return fetch(origin + path, {
    headers: auth ? { cookie } : {},
    redirect: "manual",
  });
}
async function formFor(path: string, field: string) {
  const response = await get(path);
  assert.equal(response.status, 200);
  const html = await response.text();
  const form = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)]
    .map((m) => m[0])
    .find((f) => f.includes(`name="${field}"`));
  assert.ok(form, `Missing form ${path} ${field}`);
  const data = new FormData();
  for (const input of form.matchAll(/<input\b[^>]*>/g)) {
    const name = /name="([^"]+)"/.exec(input[0])?.[1],
      value = /value="([^"]*)"/.exec(input[0])?.[1] ?? "";
    if (name && input[0].includes('type="hidden"'))
      data.set(decode(name), decode(value));
  }
  return data;
}
async function post(path: string, data: FormData, auth = true) {
  const response = await fetch(origin + path, {
    method: "POST",
    headers: { origin, ...(auth ? { cookie } : {}) },
    body: data,
    redirect: "manual",
  });
  return { response, html: await response.text() };
}
try {
  for (const path of [
    "/admin",
    "/admin?view=funds",
    "/admin?view=transactions",
    "/admin?view=transfers",
    "/admin?view=sync",
  ]) {
    const r = await get(path);
    assert.equal(r.status, 200);
    assert.ok(!(await r.text()).includes("Chưa thể tải dữ liệu"));
    assert.equal((await get(path, false)).status, 307);
  }
  const legacy = await get("/admin/funds?edit=legacy-test");
  const expectedLegacyTarget = "/admin?modal=edit-fund&fundId=legacy-test";
  if (legacy.status === 307) assert.equal(legacy.headers.get("location"), expectedLegacyTarget);
  else {
    // Next.js can stream a redirect as a meta refresh after the parent shell.
    assert.equal(legacy.status, 200);
    const html = decode(await legacy.text());
    assert.ok(html.includes('http-equiv="refresh"'));
    assert.ok(html.includes(`url=${expectedLegacyTarget}`));
  }
  assert.equal(
    (await fetch(origin + "/api/sync/transactions", { method: "POST" })).status,
    401,
  );
  const f = await db.fund.findUniqueOrThrow({ where: { slug: "0572-tptest" } });
  const initial = await (await get("/t/0572-tptest", false)).text();
  assert.ok(initial.includes("*******678"));
  assert.ok(!initial.includes("0912345678"));
  assert.ok(!initial.includes("0912 345 678"));
  assert.ok(!initial.includes("0987654321"));
  await db.fund.update({
    where: { id: f.id },
    data: { name: "TEST CACHE SHOULD STAY HIDDEN" },
  });
  assert.ok(
    !(await (await get("/t/0572-tptest", false)).text()).includes(
      "TEST CACHE SHOULD STAY HIDDEN",
    ),
  );
  const edit = await formFor(
    "/admin?view=funds&modal=edit-fund&fundId=" + f.id,
    "code",
  );
  edit.set("id", f.id);
  edit.set("accountId", f.accountId);
  edit.set("code", f.code);
  edit.set("name", "TEST UPDATED AFTER INVALIDATION");
  edit.set("description", "TEST 0912345678");
  edit.set("keywords", "TU KHOA TEST");
  edit.set("status", "ACTIVE");
  const denied = await post(
    "/admin?view=funds&modal=edit-fund&fundId=" + f.id,
    edit,
    false,
  );
  assert.equal(denied.response.status, 303);
  assert.equal(
    (await db.fund.findUniqueOrThrow({ where: { id: f.id } })).name,
    "TEST CACHE SHOULD STAY HIDDEN",
  );
  const saved = await post(
    "/admin?view=funds&modal=edit-fund&fundId=" + f.id,
    edit,
  );
  assert.equal(saved.response.status, 200);
  assert.ok(saved.html.includes("Đã lưu thiện pháp"));
  assert.ok(
    (await (await get("/t/0572-tptest", false)).text()).includes(
      "TEST UPDATED AFTER INVALIDATION",
    ),
  );
  const pending = await db.bankTransaction.findFirstOrThrow({
    where: { fundId: null },
  });
  const assign = await formFor(
    "/admin?view=transactions&pending=1",
    "transactionId",
  );
  assign.set("transactionId", pending.id);
  assign.set("fundId", f.id);
  assign.set("reason", "QA manual assignment");
  assert.ok(
    (await post("/admin?view=transactions&pending=1", assign)).html.includes(
      "Đã gán giao dịch",
    ),
  );
  assert.equal(
    (await db.bankTransaction.findUniqueOrThrow({ where: { id: pending.id } }))
      .assignment,
    "MANUAL",
  );
  const to = await db.fund.findUniqueOrThrow({
    where: { slug: "0572-tpother" },
  });
  const transfer = await formFor(
    "/admin?view=transfers&modal=transfer",
    "requestId",
  );
  transfer.set("fromFundId", f.id);
  transfer.set("toFundId", to.id);
  transfer.set("amount", "10000");
  transfer.set("reason", "QA transfer operation");
  assert.ok(
    (
      await post("/admin?view=transfers&modal=transfer", transfer)
    ).html.includes("Đã điều chuyển"),
  );
  await post("/admin?view=transfers&modal=transfer", transfer);
  assert.equal(await db.transfer.count(), 1);
  const importHtml = await (await get("/admin?modal=import-fund&fundId=" + f.id)).text();
  assert.ok(importHtml.includes('name="file"'));
  assert.ok(importHtml.includes(".xlsx"));
  assert.ok(!(await (await get("/admin")).text()).includes("Chốt sổ"));
  const revoked = await encode({
    token: { email: "not-allowed@example.test", sub: "qa-denied" },
    secret: process.env.AUTH_SECRET!,
    salt: "authjs.session-token",
    maxAge: 60,
  });
  assert.equal(
    (
      await fetch(origin + "/admin?view=funds", {
        headers: { cookie: `authjs.session-token=${revoked}` },
        redirect: "manual",
      })
    ).status,
    307,
  );
  console.log(
    "PASS: all admin routes guarded, unauthorized mutation rejected, valid admin forms, phone masking, shared cache and invalidation, manual assignment, transfer dedup, Excel modal/no closing workflow, allowlist checked each request",
  );
} finally {
  await db.$disconnect();
}
