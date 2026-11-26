import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicQr} from '../src/lib/public-qr';

test('only the supplied account QR images can be selected; unset QR remains hidden',()=>{
 assert.equal(publicQr(null),null);assert.equal(publicQr(''),null);assert.equal(publicQr('unknown'),null);
 assert.equal(publicQr('0572')?.owner,'HO THI TRA MY');assert.equal(publicQr('0856')?.owner,'TRAN THU TRAM');
 for(const account of ['0572','0856']){
  const qr=publicQr(account)!;
  const bytes=readFileSync('public'+qr.src);
  assert.equal(bytes.subarray(1,4).toString(),'PNG');
  assert.equal(bytes.readUInt32BE(16),qr.width);assert.equal(bytes.readUInt32BE(20),qr.height);
 }
});
