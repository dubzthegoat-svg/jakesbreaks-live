(() => {
  const script = document.currentScript;
  if (!script || document.querySelector('[data-jakes-live]')) return;
  const endpoint = new URL('/status', script.src).href;
  const host = document.createElement('div');
  host.dataset.jakesLive = '';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;max-width:calc(100vw - 32px);font:600 15px/1.4 system-ui,sans-serif}
    nav{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
    a{display:flex;align-items:center;gap:9px;background:#171717;color:white;padding:13px 18px;border:2px solid white;border-radius:999px;text-decoration:none;box-shadow:0 4px 18px #0004}
    a:focus-visible{outline:3px solid #ffcf24;outline-offset:4px}
    span{display:block;width:9px;height:9px;border-radius:50%;background:#ff485a}
    @media(max-width:480px){:host{bottom:16px}a{font-size:13px;padding:11px 14px}}
  `;
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Watch our live shows');
  root.append(style, nav);
  document.body.append(host);
  let running = false;
  async function update() {
    if (running || document.hidden) return;
    running = true;
    try {
      const response = await fetch(endpoint, { cache: 'no-store', credentials: 'omit',
        signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error('Unavailable');
      const data = await response.json();
      const refresh = Number(data.refreshAfterSeconds);
      const maxAge = Math.max(180, Math.min(3600, Number.isFinite(refresh) ? refresh + 30 : 180)) * 1000;
      const links = [];
      for (const item of data.platforms || []) {
        const age = Date.now() - Date.parse(item.checkedAt);
        if (item.state !== 'live' || !Number.isFinite(age) || age > maxAge || age < -60_000) continue;
        const tiktok = item.platform === 'tiktok' &&
          item.url === 'https://www.tiktok.com/@jakesbreaksuk/live';
        const whatnot = item.platform === 'whatnot' &&
          /^https:\/\/www\.whatnot\.com\/live\/[a-zA-Z0-9-]+$/.test(item.url);
        if (!tiktok && !whatnot) continue;
        const link = document.createElement('a');
        link.href = item.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        const dot = document.createElement('span');
        dot.setAttribute('aria-hidden', 'true');
        link.append(dot, document.createTextNode(`We're live on ${tiktok ? 'TikTok' : 'Whatnot'} ↗`));
        links.push(link);
      }
      nav.replaceChildren(...links);
    } catch { nav.replaceChildren(); }
    finally { running = false; }
  }
  update();
  setInterval(update, 30_000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) nav.replaceChildren(); else update();
  });
})();
