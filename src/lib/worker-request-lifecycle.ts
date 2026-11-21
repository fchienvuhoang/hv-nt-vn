// Shared between the Worker entry point and the separately bundled Next server.
export const requestCleanup = Symbol.for('hvntvn.request-cleanup');
type Cleanup = () => Promise<void>;
export type CleanupContext = {[requestCleanup]?: (cleanup: Cleanup) => void};
type Context = {waitUntil(promise: Promise<unknown>): void};

/** Keep request-owned sockets alive through streaming and Next's after() work. */
export async function withRequestLifecycle<T extends Context>(
  context: T,
  handle: (context: T & CleanupContext) => Promise<Response>,
): Promise<Response> {
  const pending = new Set<Promise<unknown>>();
  const cleanups: Cleanup[] = [];
  const track = (promise: Promise<unknown>) => {
    // Turn rejections into settled work without creating an unhandled promise.
    const settled = Promise.resolve(promise).then(() => {}, () => {});
    pending.add(settled);
    void settled.then(() => pending.delete(settled));
  };
  const scoped = new Proxy(context, {
    get(target, key) {
      if (key === requestCleanup) return (cleanup: Cleanup) => cleanups.push(cleanup);
      if (key === 'waitUntil') return (promise: Promise<unknown>) => {
        track(promise);
        target.waitUntil(promise);
      };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as T & CleanupContext;
  try {
    const response = await handle(scoped);
    if (!response.body || response.status === 101) return response;
    const stream = new TransformStream<Uint8Array, Uint8Array>();
    track(response.body.pipeTo(stream.writable));
    return new Response(stream.readable, response);
  } finally {
    context.waitUntil((async () => {
      // Background work may itself register more work or open a DB client.
      while (pending.size) await Promise.all([...pending]);
      await Promise.all(cleanups.map(async cleanup => {
        try { await cleanup(); }
        catch { console.error('Request database cleanup failed'); }
      }));
    })());
  }
}
