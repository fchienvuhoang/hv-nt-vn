import test from "node:test";
import assert from "node:assert/strict";
import { parseVnd, parseExcelTime, parseFundGrid } from "../src/lib/fund-excel";
import { chooseEntryMatch, ledgerMatchKey, type EntryMatch } from "../src/lib/entry-matching";
test("VND supports both formats in the supplied Sheets without rounding",()=>{
  assert.equal(parseVnd("817.727.671"),817727671n);assert.equal(parseVnd("194,115,128"),194115128n);assert.equal(parseVnd("1 000 000"),1000000n);
  assert.throws(()=>parseVnd("1.5"));assert.throws(()=>parseVnd(-10));assert.throws(()=>parseVnd("10000000000000000"));
});
test("both old date formats preserve Vietnamese wall time and reject invalid days",()=>{
  assert.equal(parseExcelTime("2026-06-26 08:49"),"2026-06-26T01:49:00.000Z");
  assert.equal(parseExcelTime("29/08/2026 20:57"),"2026-08-29T13:57:00.000Z");assert.throws(()=>parseExcelTime("31/02/2026 20:57"));
});
test("ignore summary and m² auxiliary rows; keep manual allocation notes and compute totals from entries",()=>{
  const sheet=parseFundGrid("Thu chi",[
    ["TP63 - THIEN PHAP"],
    ["STT","Thời gian","Chủ tài khoản","Nội dung","Tiền ra","Tiền vào/ Số m2 đã thành tựu","Ghi chú"],
    ["","","","","200.000","1.000.000"],
    ["","","","","","273"],
    ["1","2026-06-26 08:49","THI CHU","TP63 FT26177716340734","","1.000.000","Tác ý bằng tay"],
    ["2","29/08/2026 20:57","","Chi thực tế","200,000","",""],
  ])!;
  assert.equal(sheet.rows.length,2);assert.equal(sheet.income,"1000000");assert.equal(sheet.expense,"200000");assert.equal(sheet.sourceIncome,"1000000");assert.equal(sheet.errors.length,0);assert.equal(sheet.rows[0].note,"Tác ý bằng tay");assert.equal(sheet.rows[0].refId,"FT26177716340734");
});
test("malformed financial rows are reported instead of silently dropped",()=>{
  const sheet=parseFundGrid("Data",[["Thời gian","Nội dung","Tiền ra","Tiền vào"],["2026-06-26 08:49","bad","100","200"],["","missing date","","200"]])!;
  assert.equal(sheet.rows.length,0);assert.equal(sheet.errors.length,2);
});
test("only a unique full identity auto-matches; equal date/amount alone needs review",()=>{
  const at=new Date("2026-06-26T01:49:00Z");
  const entry:EntryMatch={id:"a",accountId:"bank",origin:"EXCEL",entryStatus:"POSTED",direction:"CREDIT",amount:1000n,occurredAt:at,narrative:"TP63 donor one",refId:"",fundId:"fund",assignment:"MANUAL",matchKey:ledgerMatchKey({at,amount:1000n,direction:"CREDIT",narrative:"TP63 donor one"})};
  assert.equal(chooseEntryMatch({at,amount:1000n,direction:"CREDIT",narrative:"tp63 DONOR one",refId:""},[entry]).exact?.id,"a");
  const uncertain=chooseEntryMatch({at,amount:1000n,direction:"CREDIT",narrative:"different",refId:""},[entry]);assert.equal(uncertain.exact,null);assert.equal(uncertain.suspected.length,1);
  assert.equal(chooseEntryMatch({at,amount:1000n,direction:"CREDIT",narrative:entry.narrative,refId:""},[entry,{...entry,id:"b"}]).exact,null);
});
