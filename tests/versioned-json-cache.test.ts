import test from "node:test";
import assert from "node:assert/strict";
import {VersionedJsonCache} from "../src/lib/versioned-json-cache";
test("new manifest evicts an obsolete decoded snapshot",()=>{
 const cache=new VersionedJsonCache<object>(100,2),old={balance:"100"};
 cache.set("fund","v1",old,10);assert.equal(cache.get("fund","v1"),old);
 assert.equal(cache.get("fund","v2"),undefined);assert.equal(cache.get("fund","v1"),undefined);
});
test("decoded cache respects payload and entry bounds with LRU eviction",()=>{
 const cache=new VersionedJsonCache<number>(20,2);
 cache.set("a","1",1,10);cache.set("b","1",2,10);cache.get("a","1");cache.set("c","1",3,10);
 assert.equal(cache.get("b","1"),undefined);assert.equal(cache.get("a","1"),1);
 cache.set("a","2",4,21);assert.equal(cache.get("a","1"),undefined);assert.equal(cache.get("a","2"),undefined);assert.equal(cache.get("c","1"),3);
});
