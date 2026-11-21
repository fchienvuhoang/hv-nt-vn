import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withResponseTiming} from '../src/lib/response-timing';

test('nested request timings preserve existing timings, auth/cache headers and streaming body', async () => {
  const response = await withResponseTiming('worker', () => withResponseTiming('route', async () =>
    new Response('data', {status: 401, headers: {'Server-Timing': 'snapshot;dur=12.0', 'Cache-Control': 'private, no-store', 'Set-Cookie': 'session=test; HttpOnly'}})));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('Set-Cookie'), 'session=test; HttpOnly');
  assert.match(response.headers.get('Server-Timing')!, /^snapshot;dur=12.0, route;dur=\d+\.\d, worker;dur=\d+\.\d$/);
  assert.equal(await response.text(), 'data');
});
