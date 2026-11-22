import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fundPickerOptions,fundPickerAmounts,fundPickerStatus} from '../src/lib/fund-picker-options';
test('fund pickers enrich only eligible funds, sort oldest first and search Vietnamese without accents',()=>{
 const metadata=new Map([
  ['new',{id:'new',code:'TP2',name:'HỘ TRÌ TĂNG',createdAt:'2026-11-22',status:'ACTIVE',fundingIncome:'9007199254740993',excessExpense:'42'}],
  ['old',{id:'old',code:'TP1',name:'Cúng dường y',createdAt:'2026-01-01',status:'PAUSED'}],
  ['other',{id:'other',code:'TP3',name:'Other',createdAt:'2025-01-01'}],
 ]);
 const eligible=[{id:'new',code:'TP2',name:'HỘ TRÌ TĂNG'},{id:'old',code:'TP1',name:'Cúng dường y'}];
 assert.deepEqual(fundPickerOptions(eligible,metadata).map(f=>f.id),['old','new']);
 assert.deepEqual(fundPickerOptions(eligible,metadata,'ho tri tang').map(f=>f.id),['new']);
 assert.deepEqual(fundPickerOptions(eligible,metadata,'tp1').map(f=>f.id),['old']);
 assert.equal(fundPickerOptions(eligible,metadata,'not found').length,0);
 const amounts=fundPickerAmounts(fundPickerOptions(eligible,metadata)[1]);
 assert.equal(amounts.income,9007199254740993n);assert.equal(amounts.excess,42n);
 assert.equal(fundPickerStatus('ACTIVE'),'Đang hoạt động');assert.equal(fundPickerStatus('PAUSED'),'Tạm dừng');assert.equal(fundPickerStatus('COMPLETED'),'Đã hoàn thành');
});
