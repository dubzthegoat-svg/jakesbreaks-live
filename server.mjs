import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const handle = 'jakesbreaksuk';
const tiktokUrl = `https://www.tiktok.com/@${handle}/live`;
const providerCodes = new Set(['unauthorized', 'insufficient_credits', 'restricted_page',
  'not_found', 'upstream_rate_limited', 'upstream_challenged', 'unsupported_page',
  'unsafe_redirect', 'response_too_large', 'payload_too_complex', 'request_limit',
  'upstream_error', 'busy', 'timeout', 'invalid_request', 'internal_error']);

export function normalize(platform, data, now = Date.now()) {
  const unknown = { platform, state: 'unknown', url: null };
  const fetched = Date.parse(data?.fetchedAt);
  if (data?.success !== true || data.status !== 'success' ||
      data.coverage?.complete !== true || !Number.isFinite(fetched) ||
      now - fetched > 60_000 || fetched - now > 60_000) return unknown;
  if (platform === 'tiktok') {
    if (data.liveRoomUserInfo?.user?.uniqueId?.toLowerCase() !== handle ||
        typeof data.is_live !== 'boolean') return unknown;
    if (data.is_live && data.liveRoom?.status !== 2) return unknown;
    return { platform, state: data.is_live ? 'live' : 'offline',
      url: data.is_live ? tiktokUrl : null };
  }
  if (platform !== 'whatnot' || !Array.isArray(data.shows)) return unknown;
  if (data.shows.some(show => show.user?.username?.toLowerCase() !== handle)) return unknown;
  const live = data.shows.find(show => show.status === 'PLAYING' && !show.endTime &&
    show.isHiddenBySeller === false);
  if (live) {
    if (!/^https:\/\/www\.whatnot\.com\/live\/[a-zA-Z0-9-]+$/.test(live.url)) return unknown;
    return { platform, state: 'live', url: live.url };
  }
  if (data.pagination?.hasMore === true ||
      data.shows.some(show => !['CREATED', 'ENDED'].includes(show.status))) return unknown;
  return { platform, state: 'offline', url: null };
}

export function createChecker({ key, fetcher = fetch, now = Date.now, cacheMs = 120_000 } = {}) {
  const cache = new Map();
  const pending = new Map();
  async function check(platform) {
    const previous = cache.get(platform);
    if (previous && now() - previous.at < cacheMs) return previous.value;
    if (pending.has(platform)) return pending.get(platform);
    const task = (async () => {
      let value = { platform, state: 'unknown', url: null };
      let diagnostic = { reason: 'provider_not_configured' };
      if (key) {
        try {
          const path = platform === 'tiktok' ? 'tiktok/user/live' : 'whatnot/user/shows';
          const response = await fetcher(`https://api.scrapeatlas.com/v1/${path}?handle=${handle}`, {
            headers: { 'x-api-key': key, accept: 'application/json' },
            redirect: 'error', signal: AbortSignal.timeout(15_000)
          });
          diagnostic = { httpStatus: response.status, reason: 'provider_response_invalid' };
          const data = await response.json();
          if (response.ok) {
            value = normalize(platform, data, now());
            diagnostic.reason = value.state === 'unknown' ? 'response_not_verified' : 'verified';
            diagnostic.success = data.success === true;
            diagnostic.complete = data.coverage?.complete === true;
            const fetched = Date.parse(data.fetchedAt);
            diagnostic.responseAgeSeconds = Number.isFinite(fetched) ? Math.round((now() - fetched) / 1000) : null;
          }
          if (providerCodes.has(data.failure?.code)) diagnostic.reason = data.failure.code;
        } catch {
          value = { platform, state: 'unknown', url: null };
          diagnostic = { reason: 'provider_request_failed' };
        }
      }
      const result = { ...value, diagnostic, checkedAt: new Date(now()).toISOString() };
      cache.set(platform, { at: now(), value: result });
      return result;
    })();
    pending.set(platform, task);
    try { return await task; } finally { pending.delete(platform); }
  }
  return async () => ({ handle, platforms: await Promise.all(['tiktok', 'whatnot'].map(check)),
    refreshAfterSeconds: Math.ceil(cacheMs / 1000) });
}

export async function createServer({ key = process.env.SCRAPEATLAS_API_KEY, fetcher,
  cacheMs = Math.max(60, Number(process.env.CHECK_INTERVAL_SECONDS) || 120) * 1000 } = {}) {
  const checker = createChecker({ key, fetcher, cacheMs });
  const widget = await readFile(new URL('./widget.js', import.meta.url));
  return http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/healthz') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, providerConfigured: Boolean(key) }));
    } else if (path === '/widget.js') {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.end(widget);
    } else if (path === '/status') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      try { res.end(JSON.stringify(await checker())); }
      catch { res.writeHead(503); res.end(JSON.stringify({ platforms: [] })); }
    } else { res.writeHead(404); res.end('Not found'); }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = await createServer();
  server.listen(Number(process.env.PORT) || 10000, '0.0.0.0');
  process.on('SIGTERM', () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
