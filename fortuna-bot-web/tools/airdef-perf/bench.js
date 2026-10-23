// Замер производительности одного пресета (телефон в горизонтали, город, вылет с автопилотом): к/с и ровность кадров, загрузка главного
// потока, время кадра, вызовы отрисовки — в обычном режиме и при замедленном процессоре (×4 ≈ телефон среднего класса, ×8 ≈ бюджетный);
// в конце — видеопамять текстур и память JS. Одна строка JSON.
//   PORT=8937 deno run -A tools/airdef-perf/bench.js <пресет> [секунд на фазу = 12]
// PORT=8938 — копия «до» (git archive <коммит> fortuna-bot-web/games fortuna-bot-web/config.js, python3 -m http.server 8938).
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [preset = 'medium', secArg = '12'] = Deno.args, SEC = +secArg, PORT = Deno.env.get('PORT') || '8937';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=915,412', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
await page.setViewport({ width: 915, height: 412, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, isLandscape: true });
await page.evaluateOnNewDocument((p) => {
  localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'air', diff: 'arcade', era: 3, side: 'east' })); localStorage.setItem('fortuna_airdef_gfx', p); localStorage.setItem('fortuna_airdef_perfhud', '1');
  if (typeof ImageBitmap !== 'undefined') ImageBitmap.prototype.close = function () {}; // замер памяти: размеры картинок не пропадают
  // моменты отрисованных кадров (счётчик кадров рендерера вырос)
  window.__ft = []; const raf = window.requestAnimationFrame.bind(window); let last = -1;
  window.requestAnimationFrame = (cb) => raf((t) => { cb(t); const R = window.__a && window.__a.renderer; if (R) { const f = R.info.render.frame; if (f !== last) { last = f; window.__ft.push(performance.now()); } } });
}, preset);
await page.goto(`http://127.0.0.1:${PORT}/fortuna-bot-web/games/airdef.html?test=1&touch=1&map=city&weather=day&go=air${Deno.env.get('Q') || ''}`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
for (let i = 0; i < 150; i++) { const l = await page.evaluate(() => { const e = document.getElementById('assetLoad'); return e && e.classList.contains('on'); }); if (!l && i > 8) break; await new Promise((r) => setTimeout(r, 1000)); }
await page.evaluate(() => { const C = window.__a; if (C.setAuto) C.setAuto(true); });
await new Promise((r) => setTimeout(r, 5000));
const cdp = await page.target().createCDPSession(); await cdp.send('Performance.enable');
const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const phase = async (rate) => {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate }); await new Promise((r) => setTimeout(r, 2500)); // осесть
  await page.evaluate(() => { window.__ft.length = 0; window.__calls = []; });
  const m0 = await metric(), t0 = Date.now();
  const callsT = setInterval(() => page.evaluate(() => { const R = window.__a.renderer; window.__calls.push(R.info.render.calls); }).catch(() => {}), 500);
  await new Promise((r) => setTimeout(r, SEC * 1000)); clearInterval(callsT);
  const m1 = await metric(), wall = (Date.now() - t0) / 1000;
  const r = await page.evaluate(() => {
    const ft = window.__ft.slice(), d = []; for (let i = 1; i < ft.length; i++) d.push(ft[i] - ft[i - 1]); d.sort((a, b) => a - b);
    const q = (p) => (d.length ? d[Math.min(d.length - 1, Math.floor(p * d.length))] : 0), calls = window.__calls;
    return { frames: ft.length, span: ft.length > 1 ? (ft[ft.length - 1] - ft[0]) / 1000 : 0, p50: q(0.5), p95: q(0.95), p99: q(0.99), jank33: d.filter((x) => x > 34).length / Math.max(1, d.length), jank50: d.filter((x) => x > 51).length / Math.max(1, d.length),
      calls: calls.length ? Math.round(calls.reduce((s, x) => s + x, 0) / calls.length) : 0, hud: ((document.getElementById('perf') || {}).textContent || '').slice(0, 140) };
  });
  const busy = ((m1.TaskDuration - m0.TaskDuration) / wall); // доля времени главного потока (реального) — с учётом замедления это «нагрузка» эмулированного процессора
  return { rate, fps: +(r.frames / Math.max(0.1, r.span)).toFixed(1), p50: +r.p50.toFixed(1), p95: +r.p95.toFixed(1), p99: +r.p99.toFixed(1), jank33: +(100 * r.jank33).toFixed(1), jank50: +(100 * r.jank50).toFixed(1), busy: +(100 * busy).toFixed(1), calls: r.calls, cpuMs: +((r.hud.match(/ЦП ([\d.]+) мс/) || [])[1] || 0) };
};
const out = { preset, port: PORT, phases: [] };
for (const rate of (Deno.env.get('RATES') || '1,4,8').split(',').map(Number)) out.phases.push(await phase(rate));
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
out.mem = await page.evaluate(() => {
  const C = window.__a, tex = new Set(); let mb = 0;
  C.scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) { for (const k in m) if (m[k] && m[k].isTexture) tex.add(m[k]); if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k] && m.uniforms[k].value; if (v && v.isTexture) tex.add(v); } } });
  for (const t of tex) { const im = t.image || {}; if (t.isCompressedTexture) mb += (t.ktxBytes || (t.mipmaps || []).reduce((s, x) => s + (x.data ? x.data.byteLength : 0), 0)) / 1048576; else mb += (im.width || 0) * (im.height || 0) * 4 * 4 / 3 / 1048576; }
  let geo = 0; const gs = new Set(); C.scene.traverse((o) => { if (o.geometry && !gs.has(o.geometry)) { gs.add(o.geometry); for (const k in o.geometry.attributes) { const a = o.geometry.attributes[k]; geo += a.isInterleavedBufferAttribute ? 0 : a.array.byteLength; } if (o.geometry.index) geo += o.geometry.index.array.byteLength; } });
  return { texMB: Math.round(mb), geoMB: Math.round(geo / 1048576), jsMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, pr: +C.renderer.getPixelRatio().toFixed(2) };
});
out.errs = errs.length;
console.log(JSON.stringify(out));
await browser.close();
