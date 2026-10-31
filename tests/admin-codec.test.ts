import assert from "node:assert/strict";
import test from "node:test";
import {encodeAdmin,decodeAdmin} from "../src/lib/admin-codec";
test("admin JSON preserves VND beyond JS integer precision, dates and nested arrays",()=>{
 const value={amount:99999999999999999999n,at:new Date("2026-10-31T12:00:00Z"),nested:[{value:-55n}],text:"Nội dung chuyển khoản"};
 const decoded=decodeAdmin<typeof value>(JSON.parse(JSON.stringify(encodeAdmin(value))));
 assert.deepEqual(decoded,value);
});
test("ordinary JSON and malformed type markers remain data",()=>{
 const value={note:{__ledgerType:"bigint",value:"abc"},extra:{__ledgerType:"date",value:"invalid"},text:"<script>test</script>"};
 assert.deepEqual(decodeAdmin(encodeAdmin(value)),value);
});
