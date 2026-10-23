// Разбивка вызовов отрисовки по категориям сцены: deno run -A breakdown.js <пресет> [map] [game]
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [preset = 'medium', map = 'city', game = 'air'] = Deno.args;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 300000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=915,412', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 915, height: 412, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, isLandscape: true });
  await page.evaluateOnNewDocument((preset, game) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game, diff: 'arcade', era: 3, side: 'east' })); localStorage.setItem('fortuna_airdef_gfx', preset); localStorage.setItem('fortuna_airdef_perfhud', '1'); }, preset, game);
  await page.goto(`http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?test=1&touch=1&map=${map}&weather=day&go=${game}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
  for (let i = 0; i < 120; i++) { const l = await page.evaluate(() => { const e = document.getElementById('assetLoad'); return e && e.classList.contains('on'); }); if (!l && i > 6) break; await new Promise((r) => setTimeout(r, 1000)); }
  await page.evaluate(() => { const C = window.__a; if (C.setAuto) C.setAuto(true); });
  await new Promise((r) => setTimeout(r, 5000));
  const out = await page.evaluate(() => new Promise((res) => {
    const C = window.__a, R = C.renderer, orig = R.renderBufferDirect, G = C.G || {}, names = new Map();
    for (const [k, v] of Object.entries(G)) { if (v && v.isObject3D) names.set(v, 'G.' + k); else if (v && typeof v === 'object') for (const [k2, v2] of Object.entries(v)) if (v2 && v2.isObject3D) names.set(v2, 'G.' + k + '.' + k2); }
    const label = (o) => {
      let p = o; while (p && p.parent && !p.parent.isScene) { if (names.has(p)) return names.get(p); p = p.parent; }
      if (names.has(p)) return names.get(p);
      if (p.name) return p.name;
      const ud = Object.keys(p.userData || {}).filter((k) => !/^_/.test(k)).slice(0, 4).join(','); let nm = 0; p.traverse((q) => { if (q.isMesh || q.isPoints || q.isLine) nm++; });
      return `${p.type}{${ud}} сеток ${nm}`;
    };
    const tally = new Map();
    R.renderBufferDirect = function (cam, sc, geo, mat, obj) {
      const sh = mat && (mat.isMeshDepthMaterial || mat.isMeshDistanceMaterial); const pod = cam && cam !== C.camera;
      const k = (sh ? '[тени] ' : pod ? '[прицел] ' : '') + label(obj), t = tally.get(k) || { n: 0, tri: 0 };
      const idx = geo.index ? geo.index.count : (geo.attributes.position ? geo.attributes.position.count : 0); t.n++; t.tri += (obj.isInstancedMesh ? obj.count : 1) * idx / 3; tally.set(k, t);
      return orig.apply(this, arguments);
    };
    requestAnimationFrame(() => { R.renderBufferDirect = orig;
      const pre = new Map(); for (const [k, v] of tally) { const p = k.replace(/\.\d+$/, '.*'); const q = pre.get(p) || { n: 0, tri: 0, m: 0 }; q.n += v.n; q.tri += v.tri; q.m++; pre.set(p, q); }
      const tot = [...tally.values()].reduce((s, v) => s + v.n, 0);
      res({ tot, perf: (document.getElementById('perf') || {}).textContent, rows: [...pre].sort((a, b) => b[1].n - a[1].n).slice(0, 30).map(([k, v]) => `${String(v.n).padStart(4)} выз. ${(v.tri / 1000).toFixed(0).padStart(6)} тыс. тр. ${v.m > 1 ? `(${v.m} шт.) ` : ''}${k}`) });
    });
  }));
  if (Deno.env.get("SHOT")) await page.screenshot({ path: Deno.env.get("SHOT") });
  console.log(`== ${preset} · ${map}: всего вызовов за кадр ${out.tot}\n${out.perf}\n${out.rows.join('\n')}`);
} finally { await browser.close().catch(() => {}); }
Deno.exit(0);
