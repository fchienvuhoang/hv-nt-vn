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

test("latest month selection keeps both accounts, handles explicit years and never falls back to older months with more rows",async()=>{
  const {latestMonthSheetNames}=await import("../src/lib/fund-excel");
  assert.deepEqual(latestMonthSheetNames(["THÁNG 9- TK Trâm","THÁNG 10- TK My","THÁNG 11- TK Trâm","THÁNG 11- TK My"],2026),["THÁNG 11- TK Trâm","THÁNG 11- TK My"]);
  assert.deepEqual(latestMonthSheetNames(["THÁNG 12/2025 TK MY","THÁNG 1/2026 TK MY"],2026),["THÁNG 1/2026 TK MY"]);
  assert.deepEqual(latestMonthSheetNames(["TK MY","TK TRÂM"],2026),["TK MY","TK TRÂM"]);
});

test("monthly carry-forward is an opening snapshot, not a new receipt, while arbitrary missing dates still fail",()=>{
 const sheet=parseFundGrid("THÁNG 11.2026 - TK Trâm",[["Thời gian","Nội dung","Tiền ra","Tiền vào"],["","","","14.885.773"],["","Điều chuyển số dư từ tháng 10 sang","","14.885.773"],["01/11/2026 09:00","New donor","","1000"]])!;
 assert.equal(sheet.errors.length,0);assert.equal(sheet.income,"1000");assert.equal(sheet.expense,"0");assert.equal(sheet.rows[0].kind,"OPENING");assert.equal(sheet.rows[0].at,"2026-10-31T17:00:00.000Z");assert.equal(sheet.rows[0].amount,"14885773");
 const bad=parseFundGrid("Data",[["Thời gian","Nội dung","Tiền ra","Tiền vào"],["","Unknown gift","","1000"]])!;assert.equal(bad.errors.length,1);
 const duplicate=parseFundGrid("THÁNG 11.2026",[["Thời gian","Nội dung","Tiền ra","Tiền vào"],["","Số dư đầu tháng","","1000"],["","Số dư chuyển sang","","1000"]])!;assert.equal(duplicate.errors.length,1);
});

test("negative balances in the credit column retain their sign as debit opening snapshots, never new expenses",async()=>{
 const {importedOpeningBalance,importedOpeningSourceTotals}=await import("../src/lib/fund-excel");
 const sheet=parseFundGrid("THÁNG 11.2026 - TK My",[["Thời gian","Nội dung","Tiền ra","Tiền vào"],["","","","-11579561"],["","Điều chuyển số dư từ tháng 10 sang","","-11579561"]])!;
 assert.deepEqual(sheet.errors,[]);assert.equal(sheet.rows[0].kind,"OPENING");assert.equal(sheet.rows[0].direction,"DEBIT");assert.equal(sheet.rows[0].amount,"11579561");assert.equal(sheet.income,"0");assert.equal(sheet.expense,"0");assert.equal(sheet.sourceIncome,"-11579561");assert.equal(sheet.sourceExpense,"0");assert.equal(importedOpeningBalance(sheet.rows),-11579561n);assert.deepEqual(importedOpeningSourceTotals(sheet.rows),{income:-11579561n,expense:0n});
 const ordinary=parseFundGrid("Data",[["Thời gian","Nội dung","Tiền ra","Tiền vào"],["01/11/2026 09:00","Not a balance","","-11579561"]])!;assert.equal(ordinary.errors.length,1);
});

test("latest month retains a missing account's standalone ledger and converts verified pre-period activity into one balance",async()=>{
 const {latestMonthSheetNames,includeStandaloneAccountBalance}=await import("../src/lib/fund-excel");
 assert.deepEqual(latestMonthSheetNames(["TK My- THÁNG 11","TK My- THÁNG 10","TK Trâm"],2026),["TK My- THÁNG 11","TK Trâm"]);
 assert.deepEqual(latestMonthSheetNames(["THÁNG 11 TK My","THÁNG 11 TK Trâm","TK Trâm"],2026),["THÁNG 11 TK My","THÁNG 11 TK Trâm"]);
 const parsed=parseFundGrid("TK Trâm",[["TRAI TANG TK MY"],["Thời gian","Nội dung","Tiền ra","Tiền vào"],["","","50","200"],["30/10/2026 09:00","Gift","","200"],["30/10/2026 10:00","Expense","50",""]])!;
 assert.equal(parsed.accountHint,"0856");const snapshot=includeStandaloneAccountBalance(parsed,2026*12+10);assert.deepEqual(snapshot.errors,[]);assert.equal(snapshot.rows.length,1);assert.equal(snapshot.rows[0].kind,"OPENING");assert.equal(snapshot.rows[0].amount,"150");assert.equal(snapshot.rows[0].direction,"CREDIT");assert.equal(snapshot.income,"0");assert.equal(snapshot.expense,"0");assert.equal(snapshot.sourceIncome,"150");
 const current=parseFundGrid("TK Trâm",[["Thời gian","Nội dung","Tiền ra","Tiền vào"],["","","","200"],["01/11/2026 09:00","Gift","","200"]])!;assert.equal(includeStandaloneAccountBalance(current,2026*12+10).errors.length,1);
 const mismatch=parseFundGrid("TK Trâm",[["Thời gian","Nội dung","Tiền ra","Tiền vào"],["","","","201"],["30/10/2026 09:00","Gift","","200"]])!;assert.equal(includeStandaloneAccountBalance(mismatch,2026*12+10).errors.length,1);
});

test("explicit undated internal fund transfers are preserved, while missing dates on ordinary gifts remain errors",()=>{
 const parsed=parseFundGrid("TP97- TK My",[["Thời gian","Nội dung","Tiền ra","Tiền vào"],["","Chuyển số dư từ TP100 về","","175611"],["","Chuyển số dư từ TP73 sang","","27161812"],["","Unknown gift","","100"]])!;
 assert.equal(parsed.rows.length,2);assert.ok(parsed.rows.every(r=>r.dateUnknown));assert.equal(parsed.income,"27337423");assert.equal(parsed.errors.length,1);
});

test("Điều chuyển số dư từ TP is an internal transfer, not a monthly opening balance",()=>{
 const s=parseFundGrid("TP54- TK Trâm",[["Thời gian","Nội dung","Tiền ra","Tiền vào"],["","Điều chuyển số dư từ TP121- Rạp che sang","","3967828"]])!;
 assert.deepEqual(s.errors,[]);assert.equal(s.rows.length,1);assert.equal(s.rows[0].dateUnknown,true);assert.equal(s.rows[0].kind,undefined);assert.equal(s.income,"3967828");
});

test("undated outgoing fund transfer preserves debit and does not become an opening snapshot",()=>{
 const s=parseFundGrid("TP121- TK Trâm",[["Thời gian","Nội dung","Tiền ra","Tiền vào"],["","Điều chuyển số dư về TP54","3967628",""]])!;
 assert.deepEqual(s.errors,[]);assert.equal(s.rows[0].dateUnknown,true);assert.equal(s.rows[0].kind,undefined);assert.equal(s.rows[0].direction,"DEBIT");assert.equal(s.expense,"3967628");
});
