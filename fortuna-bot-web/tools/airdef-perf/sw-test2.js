// Сервис-воркер после ревью: регистрирует страница, область games/airdef…, код — строго по версии, картинки — без учёта ?…; модели — из кэша страницы
import puppeteer from 'npm:puppeteer-core@22.15.0';
const PROBE = '/Users/mark./wtm-materials/fortuna-bot-web/games/airdef/_swprobe.js';
const dir = await Deno.makeTempDir();
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', userDataDir: dir, args: ['--use-angle=metal', '--enable-gpu', '--window-size=1200,700'] });
const URL0 = 'http://localhost:8937/fortuna-bot-web/games/airdef.html?test=1&sw=1';
try {
  Deno.writeTextFileSync(PROBE, 'export const v = "A";\n');
  let page = await browser.newPage(); await page.setViewport({ width: 1200, height: 700 });
  await page.goto(URL0, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__a && window.__a.state === 'menu', { timeout: 180000, polling: 500 });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 30000, polling: 300 });
  const reg = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { scope: r.scope, url: (r.active || {}).scriptURL }; });
  console.log('воркер:', JSON.stringify(reg));
  const t = (u) => page.evaluate(async (u) => (await fetch(u)).text(), u);
  const a1 = await t('airdef/_swprobe.js?v=1');
  Deno.writeTextFileSync(PROBE, 'export const v = "B";\n');
  const b2 = await t('airdef/_swprobe.js?v=2'), a1again = await t('airdef/_swprobe.js?v=1');
  console.log(`код по версии: v=1 → ${a1.trim()}, после смены файла v=2 → ${b2.trim()} (ждём B), v=1 снова → ${a1again.trim()} (из кэша, A)`);
  // картинка: тот же файл с другим ?… — из кэша
  const img = await page.evaluate(async () => { const m = await (await fetch('airdef/assets.json')).json(); const p = m.files.find(([f]) => /\.(jpg|png|webp)$/.test(f))[0];
    await fetch(`airdef/${p}?v=x1`); await new Promise((r) => setTimeout(r, 1500)); const c = await caches.open((await caches.keys()).find((k) => k.startsWith('airdef-files-'))); return { p, hit: !!(await c.match(`airdef/${p}?v=x2`, { ignoreSearch: true })) }; });
  console.log('картинка в кэше:', JSON.stringify(img));
  // «Скачать всё» и перезапуск
  const t0 = Date.now();
  const res = await page.evaluate(async () => { const M = await import('./airdef/models.js?v=20261026a'), O = await import('./airdef/offline.js?v=20261026a'); let last = ''; const r = await O.prefetchAll(M.modelUrls(), (d, n, b, tot, f) => { last = `${d}/${n} ${Math.round(b / 1048576)}/${Math.round(tot / 1048576)} МБ, ошибок ${f}`; }); return { r, last }; });
  console.log('предзагрузка:', JSON.stringify(res), `за ${((Date.now() - t0) / 1000).toFixed(0)} с`);
  // сверка: битая запись (не тот размер) и убранная из игры модель
  const fake = await page.evaluate(async () => { const c = await caches.open('airdef-models-v1'), k = (await c.keys()).find((r) => /f16\.glb/.test(r.url));
    await c.put(k.url, new Response(new Uint8Array(10))); await c.put(new URL('airdef/models/zz_removed.glb?v=1', location.href).href, new Response(new Uint8Array(5))); return k.url.replace(/^.*models\//, ''); });
  let glbNet2 = 0; const onR = (r) => { if (/\.glb/.test(r.url()) && !r.fromServiceWorker()) glbNet2++; }; page.on('response', onR);
  const t1 = Date.now();
  const res2 = await page.evaluate(async () => { const M = await import('./airdef/models.js?v=20261026a'), O = await import('./airdef/offline.js?v=20261026a'); const r = await O.prefetchAll(M.modelUrls(), () => {}); return r; });
  page.off('response', onR);
  const after = await page.evaluate(async (f) => { const c = await caches.open('airdef-models-v1'), L = await c.keys(); const k = L.find((r) => r.url.endsWith(f)); return { f16: k ? (await (await c.match(k)).blob()).size : null, removed: L.some((r) => /zz_removed/.test(r.url)) }; }, fake);
  console.log('повтор «Скачать всё»:', JSON.stringify(res2), `за ${((Date.now() - t1) / 1000).toFixed(0)} с; моделей из сети ${glbNet2} (ждём 1 — битая), f16 теперь ${after.f16} байт, убранная модель в кэше: ${after.removed}`);
  const cs = await page.evaluate(async () => { const out = {}; for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).length; return out; });
  console.log('кэши:', JSON.stringify(cs));
  await page.close();
  page = await browser.newPage(); await page.setViewport({ width: 1200, height: 700 });
  let net = 0, glbNet = 0, sw2 = 0; const netL = []; page.on('response', (r) => { const u = r.url(); if (!u.includes('localhost:8937')) return; if (r.fromServiceWorker()) sw2++; else { net++; netL.push(u.replace(/^.*fortuna-bot-web\//, '')); if (/\.glb/.test(u)) glbNet++; } });
  await page.goto(URL0, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__a && window.__a.state === 'menu', { timeout: 180000, polling: 500 });
  await new Promise((r) => setTimeout(r, 8000));
  console.log(`перезапуск: из сети ${net} (моделей ${glbNet}), через воркер ${sw2}; из сети: ${netL.join(', ')}`);
} finally { await browser.close(); try { Deno.removeSync(PROBE); } catch (_) { /* нет */ } }
