// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- OpenNext generates this module after the Next.js type-check step.
import worker from '../.open-next/worker.js';
import {withRequestLifecycle} from '../src/lib/worker-request-lifecycle';
import type {ExecutionContext} from '@cloudflare/workers-types/index.ts';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- OpenNext generates these Durable Object exports during build.
export {DOQueueHandler,DOShardedTagCache,BucketCachePurge} from '../.open-next/worker.js';
export {RuntimeCacheObject} from './runtime-cache-object';
const appWorker = {
  ...worker,
  fetch(request: Request, env: unknown, ctx: ExecutionContext) {
    return withRequestLifecycle(ctx, scoped => worker.fetch(request, env, scoped));
  },
};
export default appWorker;
