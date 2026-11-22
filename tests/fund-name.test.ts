import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hasSpacedFundNameHyphens} from '../src/lib/fund-name';

test('fund names allow separators with spaces, including after emoji',()=>{
 for(const name of ['QUỸ HỘ TRÌ TAM BẢO','TP133 - HỘ TRÌ TÔN TƯỢNG','🌿 TP133 - HỘ TRÌ - ĐỢT 2','  TP133 - HỘ TRÌ  '])assert.ok(hasSpacedFundNameHyphens(name),name);
});
test('every hyphen needs a space on both sides and cannot be at an edge',()=>{
 for(const name of ['TP133-HỘ TRÌ','TP133- HỘ TRÌ','TP133 -HỘ TRÌ','TP133 - HỘ TRÌ- ĐỢT 2','- HỘ TRÌ','HỘ TRÌ -','🌿 TP133-HỘ TRÌ'])assert.equal(hasSpacedFundNameHyphens(name),false,name);
});
