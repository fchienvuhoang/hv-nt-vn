import assert from "node:assert/strict";
import test from "node:test";
import { matchesPublicTransaction } from "../src/lib/public-search";
import { maskPhones } from "../src/lib/domain";
const row={narrative:maskPhones("Nguyễn Thị Mai TP112 0912345678"),name:"Mai",account:"0572",amount:"150000",at:"2026-10-31T05:00:00.000Z"};
test("public search matches accent/case independent content, amount, account and visible phone suffix",()=>{
 for(const query of ["nguyen thi MAI","TP112 mai","150000","150.000","0572","678","31/10/26"])assert.equal(matchesPublicTransaction(row,query),true,query);
 assert.equal(matchesPublicTransaction(row,"TP999"),false);
});
test("public search never matches masked phone digits or hidden narratives",()=>{
 assert.equal(matchesPublicTransaction(row,"0912345678"),false);
 assert.equal(matchesPublicTransaction(row,"0912345"),false);
 assert.equal(matchesPublicTransaction({...row,narrative:"Nội dung được ẩn theo nguồn sao kê"},"TP112"),false);
});

test("public search includes already-masked administrator notes",()=>{
 const annotated={...row,notes:[{text:maskPhones("Đã điều chuyển thiện pháp 0987654321")}]};
 assert.equal(matchesPublicTransaction(annotated,"dieu chuyen"),true);
 assert.equal(matchesPublicTransaction(annotated,"321"),true);
 assert.equal(matchesPublicTransaction(annotated,"0987654321"),false);
});
