import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { maskPhones } from "../src/lib/domain";

test("catalog includes all funds like admin, exposes only safe metadata and gates recognition links", async () => {
  let query: { where: unknown; select: Record<string, boolean>; orderBy: unknown } | undefined;
  const fund = { code: "TP130", slug: "0572-tp130", name: "Thiện pháp 0912345678", status: "ACTIVE", isLongTerm: false, recognitionEnabled: true, recognitionTitle: "Cổ phần", recognitionAmount: 3000000n };
  const dependencies: Record<string, unknown> = {
    "server-only": {}, "next/cache": { unstable_cache: (fn: unknown) => fn },
    "./db": { db: { fund: { findMany: async (input: typeof query) => { query = input; return [fund, { ...fund, code: "TP9", status: "COMPLETED", recognitionEnabled: false }, { ...fund, code: "TP63", status: "PAUSED", isLongTerm: true, recognitionAmount: 0n }]; } } } },
    "./domain": { maskPhones }, "./cache-tags": { PUBLIC_DIRECTORY_TAG: "public-directory" },
  };
  const api = {} as typeof import("../src/lib/public-fund-catalog");
  vm.runInNewContext(ts.transpile(readFileSync("src/lib/public-fund-catalog.ts", "utf8"), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), { exports: api, require: (name: string) => { if (!(name in dependencies)) throw Error(name); return dependencies[name]; } });
  const result = await api.publicFundCatalog();
  assert.equal(query?.where, undefined, "catalog must not exclude funds based on publicListed unlike the public discovery page");
  assert.equal(query?.select.adminNote, undefined);
  assert.equal(query?.select.isLongTerm, true);
  assert.equal(JSON.stringify(query?.orderBy), JSON.stringify([{createdAt:"desc"},{id:"desc"}]), "new funds precede older funds regardless of code; ties are stable");
  assert.deepEqual(Array.from(result, f => f.isLongTerm), [false, false, true]);
  assert.deepEqual(Array.from(result, f => f.code), ["TP130", "TP9", "TP63"]);
  assert.deepEqual(Array.from(result, f => f.status), ["ACTIVE", "COMPLETED", "PAUSED"]);
  assert.deepEqual(Array.from(result, f => f.recognitionTitle), ["Cổ phần", null, null]);
  assert.ok(!JSON.stringify(result).includes("0912345678"));
  assert.ok(!JSON.stringify(result).includes("recognitionAmount"));
});
