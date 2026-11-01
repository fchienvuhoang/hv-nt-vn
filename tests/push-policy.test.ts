import {test} from "node:test";
import assert from "node:assert/strict";
import {transactionPushKind,validPushEndpoint} from "../src/lib/push-policy";
test("wrong-account and unassigned alerts are exclusive",()=>{
 assert.equal(transactionPushKind({assignment:"UNASSIGNED",matchReason:"Sai tài khoản nhận: HTTB"}),"wrongAccount");
 assert.equal(transactionPushKind({assignment:"UNASSIGNED",fundId:null}),"needsClassification");
 assert.equal(transactionPushKind({assignment:"MANUAL",fundId:"fund"}),null);
 assert.equal(transactionPushKind({assignment:"UNASSIGNED",entryStatus:"MERGED"}),null);
});
test("push endpoint cannot target local or arbitrary servers",()=>{
 for(const value of ["https://fcm.googleapis.com/fcm/send/key","https://web.push.apple.com/key","https://updates.push.services.mozilla.com/wpush/key","https://wns2.notify.windows.com/key"])assert.equal(validPushEndpoint(value),true,value);
 for(const value of ["http://fcm.googleapis.com/key","https://localhost/key","https://127.0.0.1/key","https://fcm.googleapis.com.evil.test/key","https://user@fcm.googleapis.com/key","https://fcm.googleapis.com:444/key"])assert.equal(validPushEndpoint(value),false,value);
});
