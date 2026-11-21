import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestCleanup, withRequestLifecycle} from '../src/lib/worker-request-lifecycle';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {resolve = done;});
  return {promise, resolve};
}
test('request cleanup waits for streaming, nested background tasks and their DB clients', async () => {
  const work: Promise<unknown>[] = [];
  const background = deferred(), nested = deferred();
  let cleaned = 0;
  const context = {waitUntil(p: Promise<unknown>) {assert.equal(this, context);work.push(p);}};
  const response = await withRequestLifecycle(context, async ctx => {
    ctx[requestCleanup]?.(async () => {cleaned++;});
    ctx.waitUntil(background.promise.then(() => {
      ctx.waitUntil(nested.promise);
      ctx[requestCleanup]?.(async () => {cleaned++;});
    }));
    return new Response('streamed response');
  });
  assert.equal(cleaned, 0);
  background.resolve();
  await response.text();
  assert.equal(cleaned, 0, 'nested background task still owns its connection');
  nested.resolve();
  await Promise.all(work);
  assert.equal(cleaned, 2);
});
test('failed requests still clean up; simultaneous requests remain independent', async () => {
  const work: Promise<unknown>[] = [];
  const context = {waitUntil(p: Promise<unknown>) {work.push(p);}};
  let cleaned = 0;
  const hold = deferred();
  const response = await withRequestLifecycle(context, async ctx => {
    ctx[requestCleanup]?.(async () => {cleaned += 10;});
    ctx.waitUntil(hold.promise);
    return new Response(null, {status: 204});
  });
  assert.equal(response.status, 204);
  await assert.rejects(withRequestLifecycle(context, async ctx => {
    ctx[requestCleanup]?.(async () => {cleaned++;});
    throw new Error('handler failed');
  }), /handler failed/);
  assert.equal(cleaned, 1);
  hold.resolve();
  await Promise.all(work);
  assert.equal(cleaned, 11);
});
