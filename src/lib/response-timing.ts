/** Measure until response headers are ready, without reading/buffering its body. */
export async function withResponseTiming(
  name: 'worker' | 'route',
  work: () => Promise<Response>,
): Promise<Response> {
  const started = performance.now();
  const response = await work();
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  headers.append('Server-Timing', `${name};dur=${(performance.now() - started).toFixed(1)}`);
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}
