import { test } from "node:test";
import assert from "node:assert/strict";
import { validateFundKeywords } from "../src/lib/fund-keywords";
import { classify } from "../src/lib/domain";
const existing = { id:"one", code:"TP112", name:"Chăm sóc sức khỏe", keywords:["THUOC BS", "CHÙA NGÀI 10"] };
test("reject all keyword/code collisions with exact fund, term and input line",()=>{
 assert.throws(()=>validateFundKeywords("TP113","khac\n  thuốcbs ",[existing]),/dòng 2.*thuốcbs.*THUOC BS.*TP112.*Chăm sóc sức khỏe/);
 assert.throws(()=>validateFundKeywords("THUOCBS","",[existing]),/Mã thiện pháp.*từ khóa.*THUOC BS.*TP112/);
 assert.throws(()=>validateFundKeywords("TP113","t p 112",[existing]),/dòng 1.*mã.*TP112/);
 assert.throws(()=>validateFundKeywords("TP112","",[existing]),/Mã thiện pháp.*TP112.*Chăm sóc sức khỏe/);
 assert.throws(()=>validateFundKeywords("TP113","chua  ngai10",[existing]),/CHÙA NGÀI 10/);
});
test("editing ignores itself, checks every other fund, and rejects repeated entries locally",()=>{
 assert.deepEqual(validateFundKeywords("TP112","THUOC BS",[existing],"one"),["THUOC BS"]);
 assert.throws(()=>validateFundKeywords("TP113","Thuoc BS\nTHUOCBS",[]),/dòng 2.*dòng 1/);
 assert.throws(()=>validateFundKeywords("TP113","tp113",[]),/trùng mã thiện pháp/);
 assert.throws(()=>validateFundKeywords("TP113","***",[]),/không chứa chữ hoặc số/);
});
test("matching ignores case, accents and inserted/missing spaces without losing code boundaries",()=>{
 const fund={...existing,accountId:"a",accountIds:["b"],status:"ACTIVE"};
 for(const text of ["CD tp112", "cd TP 112", "cD t P 1 1 2", "  cúng dường THUOCBS  ", "cung duong Thuoc\t\tBS", "chua ngai10", "Chùangài10", "chua\u00a0ngai 10"])
   assert.equal(classify(text,"b",[fund]).fundId,"one",text);
 for(const text of ["TP1120","XTP112","TP112A","THUOCBSX","XCHUANGAI10"])
   assert.equal(classify(text,"b",[fund]).fundId,null,text);
 for(const status of ["PAUSED","COMPLETED"])
   assert.equal(classify("tp 112 thuocbs","a",[{...fund,status}]).fundId,null);
});
