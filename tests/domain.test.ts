import test from "node:test";
import assert from "node:assert/strict";
import { classify, maskPhones, normalize, openingBalance, parseSourceTime, localDate, startOfVietnamDay } from "../src/lib/domain";
import { parseCsv } from "../src/lib/csv";
const a = { id: "a", accountId: "0572", code: "TP112", keywords: ["CHÙA NGÀI 10"], status: "ACTIVE" };
const b = { id: "b", accountId: "0572", code: "TP113", keywords: ["CHÙA NGÀI 10", "KHAC"], status: "ACTIVE" };
test("explicit code wins over aliases; code boundaries do not match longer codes", () => {
  assert.equal(classify("TP112 - chùa ngài 10", "0572", [a,b]).fundId, "a");
  assert.equal(classify("TP1120", "0572", [a]).fundId, null);
  assert.equal(classify("TP112 TP113", "0572", [a,b]).fundId, null);
});
test("inactive explicit codes never fall through to an active alias", () => {
  for (const status of ["PAUSED", "COMPLETED"]) assert.equal(classify("TP112 chùa ngài 10", "0572", [{ ...a, status }, b]).fundId, null);
});
test("ambiguous aliases and different bank accounts stay unassigned", () => {
  assert.equal(classify("chùa ngài 10", "0572", [a,b]).fundId, null);
  assert.equal(classify("TP112", "0856", [a]).fundId, null);
  assert.equal(classify("cúng dường Chùa Ngài 10", "0572", [a]).fundId, "a");
  assert.equal(normalize("Đức — phước"), "DUC PHUOC");
});
test("public phone redaction retains exactly three trailing digits", () => {
  for (const phone of ["0912345678", "0912 345 678", "0912.345.678", "+84 912 345 678", "02812345678", "0084912345678", "+81 90 1234 5678", "+1 (202) 555 0678"]) {
    const masked = maskPhones(`CD ${phone} xin tri an`);
    assert.match(masked, /\*+678/);
    assert.ok(!masked.includes("912"));
  }
  assert.equal(maskPhones("TP112 31/10/2026 200000 VND"), "TP112 31/10/2026 200000 VND");
  assert.ok(!maskPhones("0901440xxx").includes("0901440"));
  assert.equal(maskPhones("*******678"), "*******678");
});
test("VND accounting stays exact beyond JS safe integers", () => {
  assert.equal(openingBalance({ openingIncome: 9007199254740993n, openingExpense: 2n, openingTransferNet: -1n }), 9007199254740990n);
});
test("source timestamps without offset are Vietnamese local time", () => {
  assert.equal(parseSourceTime("2026-10-31T00:00:00").toISOString(), "2026-10-30T17:00:00.000Z");
  assert.equal(parseSourceTime("2026-10-30T17:00:00Z").toISOString(), "2026-10-30T17:00:00.000Z");
  assert.equal(localDate(startOfVietnamDay("2026-10-31")), "2026-10-31");
});
test("CSV handles Excel BOM, quoted names, CRLF, newlines and rejects broken rows", () => {
  const rows = parseCsv('\uFEFFcode,name\r\nTP1,"Tên, có dấu"\r\nTP2,"Hai\ndòng"\r\n');
  assert.deepEqual(rows, [{ code: "TP1", name: "Tên, có dấu" }, { code: "TP2", name: "Hai\ndòng" }]);
  assert.throws(() => parseCsv('code,name\nTP1,"chưa đóng'));
  assert.throws(() => parseCsv('code,name\nTP1'));
  assert.throws(() => parseCsv('code,code\nTP1,TP2'));
});

test('single-account funds never classify the other account while shared funds retain both',()=>{
 const rules=[{id:'httb',code:'HTTB',keywords:['TAM BAO'],status:'ACTIVE',accountId:'my',accountIds:[]},{id:'pscd',code:'PSCD',keywords:[],status:'ACTIVE',accountId:'tram',accountIds:[]},{id:'shared',code:'TP112',keywords:[],status:'ACTIVE',accountId:'my',accountIds:['tram']}];
 assert.equal(classify('TAM BAO','my',rules).fundId,'httb');assert.equal(classify('HTTB','tram',rules).fundId,null);assert.equal(classify('PSCD','tram',rules).fundId,'pscd');assert.equal(classify('PSCD','my',rules).fundId,null);assert.equal(classify('TP112','tram',rules).fundId,'shared');
});

test("wrong-account codes and aliases require manual review without falling through to another fund",()=>{
 const restricted={id:"httb",code:"HTTB",keywords:["HO TRI TAM BAO"],status:"ACTIVE",accountId:"my",accountIds:[]};
 const shared={id:"shared",code:"TP112",keywords:["HO TRI TAM BAO"],status:"ACTIVE",accountId:"my",accountIds:["tram"]};
 for(const text of ["HTTB","HTTB TP112","HTTB HO TRI TAM BAO","HO TRI TAM BAO"]){
  const match=classify(text,"tram",[restricted,shared]);
  assert.equal(match.fundId,null);assert.match(match.reason,/^Sai tài khoản nhận:.*HTTB/);
 }
 assert.equal(classify("TP112","tram",[restricted,shared]).fundId,"shared");
 assert.equal(classify("HTTB","my",[restricted,shared]).fundId,"httb");
});
