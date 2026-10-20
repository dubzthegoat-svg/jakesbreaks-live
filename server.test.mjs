import test from 'node:test';
import assert from 'node:assert/strict';
import { createChecker, createServer, normalize } from './server.mjs';

const time = Date.parse('2026-10-20T19:00:00Z');
const envelope = () => ({ success: true, status: 'success',
  fetchedAt: new Date(time).toISOString(), coverage: { complete: true } });
const tiktok = () => ({ ...envelope(), is_live: true,
  liveRoomUserInfo: { user: { uniqueId: 'jakesbreaksuk' } }, liveRoom: { status: 2 } });
const show = () => ({ status: 'PLAYING', endTime: null, isHiddenBySeller: false,
  user: { username: 'jakesbreaksuk' }, url: 'https://www.whatnot.com/live/abc-123' });
const whatnot = () => ({ ...envelope(), shows: [show()], pagination: { hasMore: false } });

test('TikTok requires a confirmed live room and the correct account', () => {
  assert.equal(normalize('tiktok', tiktok(), time).state, 'live');
  assert.equal(normalize('tiktok', { ...tiktok(), is_live: false }, time).state, 'offline');
  const wrong = tiktok(); wrong.liveRoomUserInfo.user.uniqueId = 'another-account';
  assert.equal(normalize('tiktok', wrong, time).state, 'unknown');
  assert.equal(normalize('tiktok', { ...tiktok(), liveRoom: { status: 4 } }, time).state, 'unknown');
});

test('missing, partial, challenged and stale data never claim live', () => {
  for (const patch of [{ success: false }, { status: 'partial' }, { status: 'challenged' },
    { coverage: { complete: false } }, { fetchedAt: null },
    { fetchedAt: new Date(time - 61_000).toISOString() }]) {
    assert.equal(normalize('tiktok', { ...tiktok(), ...patch }, time).state, 'unknown');
  }
});

test('Whatnot links to the actual public playing show, never a scheduled or private show', () => {
  assert.deepEqual(normalize('whatnot', whatnot(), time), {
    platform: 'whatnot', state: 'live', url: 'https://www.whatnot.com/live/abc-123' });
  for (const patch of [{ status: 'CREATED' }, { status: 'ENDED' },
    { isHiddenBySeller: true }, { endTime: '2026-10-20T18:59:00Z' },
    { url: 'https://evil.example/live/abc-123' }, { user: { username: 'someoneelse' } }]) {
    const data = whatnot(); Object.assign(data.shows[0], patch);
    assert.notEqual(normalize('whatnot', data, time).state, 'live');
  }
});

test('a paginated or unrecognized Whatnot response cannot establish offline', () => {
  assert.equal(normalize('whatnot', { ...whatnot(), shows: [] }, time).state, 'offline');
  assert.equal(normalize('whatnot', { ...whatnot(), shows: [],
    pagination: { hasMore: true } }, time).state, 'unknown');
  const data = whatnot(); data.shows[0].status = null;
  assert.equal(normalize('whatnot', data, time).state, 'unknown');
});

test('many concurrent visitors share provider requests and cached results; failed refresh clears live', async () => {
  let clock = time, calls = 0, fail = false;
  const checker = createChecker({ key: 'test-only', now: () => clock, cacheMs: 120_000,
    fetcher: async url => {
      calls++;
      await new Promise(resolve => setImmediate(resolve));
      if (fail) throw new Error('unavailable');
      return { ok: true, json: async () => url.includes('/tiktok/') ? tiktok() : whatnot() };
    } });
  const values = await Promise.all(Array.from({ length: 30 }, () => checker()));
  assert.equal(calls, 2);
  assert.ok(values.every(v => v.platforms.every(p => p.state === 'live')));
  await checker(); assert.equal(calls, 2);
  fail = true; clock += 120_001;
  assert.ok((await checker()).platforms.every(p => p.state === 'unknown' && p.url === null));
  assert.equal(calls, 4);
});

test('no key means no provider requests and no live buttons', async () => {
  const checker = createChecker({ fetcher: () => { throw new Error('must not call'); } });
  assert.ok((await checker()).platforms.every(p => p.state === 'unknown'));
});

test('HTTP endpoints expose no credentials and serve the widget without provider calls', async () => {
  const server = await createServer({ key: '', fetcher: () => { throw new Error('must not call'); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const health = await fetch(`${origin}/healthz`);
    assert.deepEqual(await health.json(), { ok: true, providerConfigured: false });
    const status = await fetch(`${origin}/status`);
    assert.equal(status.headers.get('cache-control'), 'no-store');
    assert.equal(status.headers.get('access-control-allow-origin'), '*');
    assert.ok((await status.json()).platforms.every(p => p.state === 'unknown'));
    const widget = await fetch(`${origin}/widget.js`);
    assert.equal(widget.status, 200);
    assert.match(await widget.text(), /We're live on/);
    assert.equal((await fetch(`${origin}/status`, { method: 'POST' })).status, 405);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
