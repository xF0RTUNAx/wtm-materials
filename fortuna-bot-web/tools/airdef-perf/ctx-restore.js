// Потеря контекста WebGL в бою на телефоне (свернул Telegram, уведомление): после возврата сжатые текстуры (земля, деревья, листы взрывов,
// модели) должны вернуться (ktx.js ktxRestore), а не стать чёрными. Снимки до / после и счёт пустых текстур KTX2.
//   [MAP=autumn W=a_eve] deno run -A tools/airdef-perf/ctx-restore.js [выход-папка = .]
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [out = '.'] = Deno.args;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 300000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=915,412', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
try {
  const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await page.setViewport({ width: 915, height: 412, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'air', diff: 'arcade', era: 3, side: 'east' })); localStorage.setItem('fortuna_airdef_gfx', 'high'); });
  await page.goto(`http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?test=1&touch=1&map=${Deno.env.get('MAP') || 'city'}&weather=${Deno.env.get('W') || 'day'}&go=air`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
  for (let i = 0; i < 150; i++) { const l = await page.evaluate(() => { const e = document.getElementById('assetLoad'); return e && e.classList.contains('on'); }); if (!l && i > 6) break; await new Promise((r) => setTimeout(r, 1000)); }
  await new Promise((r) => setTimeout(r, 4000));
  // взрыв перед камерой — лист на экране
  const boom = () => page.evaluate(() => { const C = window.__a, f = new THREE.Vector3(); C.camera.getWorldDirection(f); f.y = 0; f.normalize(); const p = C.camera.position.clone().addScaledVector(f, 900); p.y = C.city.groundH(p.x, p.z); C.fx.explosion(p, 47, 'bomb'); });
  // текстуры KTX2 в сцене: сколько с уровнями и сколько пустых (пустые после загрузки — норма, их держит видеокарта)
  const count = () => page.evaluate(() => { const C = window.__a, S = new Set(); C.scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) { for (const k in m) if (m[k] && m[k].isCompressedTexture) S.add(m[k]); if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k] && m.uniforms[k].value; if (v && v.isCompressedTexture) S.add(v); } } });
    let empty = 0; for (const t of S) if (!t.mipmaps || !t.mipmaps.length) empty++; return { ktx: S.size, empty }; });
  await boom(); await new Promise((r) => setTimeout(r, 1500));
  const before = await count(); Deno.writeFileSync(`${out}/ctx-before.png`, await page.screenshot({ type: 'png' }));
  await page.evaluate(() => { const g = window.__a.renderer.getContext(); window.__lc = g.getExtension('WEBGL_lose_context'); window.__lc.loseContext(); });
  await new Promise((r) => setTimeout(r, 1500));
  await page.evaluate(() => window.__lc.restoreContext());
  await new Promise((r) => setTimeout(r, 6000)); // заново из кэша
  await boom(); await new Promise((r) => setTimeout(r, 1500));
  const after = await count(); Deno.writeFileSync(`${out}/ctx-after.png`, await page.screenshot({ type: 'png' }));
  const st = await page.evaluate(() => { const B = window.__a.G.bake; return { state: window.__a.state, reload: !!window.__a.reloadAfterBattle, bake: B ? { ready: B.ready, on: B.U.uBk.value.x } : null }; }); // запечённая земля (ground-bake.js) — заново после возврата текстур
  console.log(JSON.stringify({ before, after, ...st, errs }));
} finally { await browser.close(); }
