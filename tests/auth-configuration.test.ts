import {test} from 'node:test';import assert from 'node:assert/strict';import {missingAuthVariables} from '../src/lib/auth-configuration';
test('Login diagnostics name exactly the missing runtime variables without exposing values',()=>{
 const complete={AUTH_SECRET:'private-session-key',AUTH_GOOGLE_ID:'client-id',AUTH_GOOGLE_SECRET:'private-oauth-key',ADMIN_EMAILS:'admin@example.test'};
 assert.deepEqual(missingAuthVariables(complete),[]);
 assert.deepEqual(missingAuthVariables({...complete,ADMIN_EMAILS:undefined}),['ADMIN_EMAILS']);
 assert.deepEqual(missingAuthVariables({...complete,AUTH_SECRET:' ',AUTH_GOOGLE_SECRET:''}),['AUTH_SECRET','AUTH_GOOGLE_SECRET']);
 assert.deepEqual(missingAuthVariables({}),['AUTH_SECRET','AUTH_GOOGLE_ID','AUTH_GOOGLE_SECRET','ADMIN_EMAILS']);
});
