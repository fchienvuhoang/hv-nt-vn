import {test} from 'node:test';import assert from 'node:assert/strict';
import {runtimeErrorDetails} from '../src/lib/runtime-error';
import {requiredDatabaseUrl,DatabaseConfigurationError} from '../src/lib/database-url';
test('Missing database runtime configuration is rejected before pg can fall back to localhost',()=>{
 assert.throws(()=>requiredDatabaseUrl(undefined),DatabaseConfigurationError);
 assert.throws(()=>requiredDatabaseUrl(' '),DatabaseConfigurationError);
 assert.equal(requiredDatabaseUrl(' postgresql://test@localhost/test '),'postgresql://test@localhost/test');
});
test('Nested driver connectivity causes are visible without SQL, passwords, URLs or donor details',()=>{
 const error={name:'PrismaClientKnownRequestError',code:'P2010',message:'SELECT password, donor FROM financial_records',meta:{driverAdapterError:{name:'DriverAdapterError',cause:{code:'28P01',originalMessage:'password authentication failed for postgresql://user:private-password@db.example/test'}}}};
 const data=runtimeErrorDetails(error);const json=JSON.stringify(data);
 assert.ok(data.some(e=>e.code==='28P01'&&e.message==='Database authentication failed'));
 for(const secret of ['private-password','postgresql://','financial_records','donor'])assert.equal(json.includes(secret),false);
 const recursive={name:'Error',message:'TLS certificate rejected',cause:null as unknown};recursive.cause=recursive;
 assert.equal(runtimeErrorDetails(recursive).length,1);
});
