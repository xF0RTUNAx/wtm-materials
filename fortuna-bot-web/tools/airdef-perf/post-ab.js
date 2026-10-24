// цена постобработки: пустая сцена → конвейер (очистка + FXAA/CAS), один проход (aaCas1) против двух, по очереди 4 круга, таймер ГП
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [preset = 'medium', map = 'autumn'] = Deno.args;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 900000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=844,390', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--enable-webgl-draft-extensions', '--enable-privileged-webgl-extensions'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true });
  await page.evaluateOnNewDocument((p) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'air', diff: 'arcade', era: 4, side: 'west' })); localStorage.setItem('fortuna_airdef_gfx', p); }, preset);
  await page.goto(`http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?test=1&touch=1&map=${map}&weather=day&go=air`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
  await new Promise((r) => setTimeout(r, 6000));
  const res = await page.evaluate(async () => {
    const C = window.__a, R = C.renderer, gl = R.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'), pipe = C.pipe;
    window.requestAnimationFrame = () => 0; C.paused = true;
    if (!pipe) return { err: 'нет конвейера' };
    const cam = C.camera, out = { two: [], one: [] };
    pipe.render(C.scene, cam, 0); gl.finish(); // настоящий кадр в буфер сцены; дальше сцена не рисуется — только постобработка
    const rr = R.render; R.render = function (s, c) { if (s === C.scene) return; return rr.call(this, s, c); };
    const sc = C.scene;
    for (let round = 0; round < 4; round++) for (const one of [false, true]) {
      pipe.cfg.aaCas1 = one; for (let k = 0; k < 10; k++) pipe.render(sc, cam, 0); gl.finish();
      const a = [];
      for (let s = 0; s < 15; s++) { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); for (let k = 0; k < 20; k++) pipe.render(sc, cam, 0); gl.endQuery(ext.TIME_ELAPSED_EXT); gl.finish();
        for (let w = 0; w < 50 && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE); w++) await new Promise((r) => setTimeout(r, 2));
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) a.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 2e7); gl.deleteQuery(q); }
      a.sort((u, v) => u - v); out[one ? 'one' : 'two'].push(a[Math.floor(a.length / 2)]);
    }
    const shots = {}; for (const one of [false, true]) { pipe.cfg.aaCas1 = one; pipe.render(sc, cam, 0); shots[one ? 'one' : 'two'] = R.domElement.toDataURL('image/png'); }
    window.__shots = shots;
    R.render = rr; pipe.cfg.aaCas1 = true; const b = new THREE.Vector2(); R.getDrawingBufferSize(b);
    return { ...out, aa: pipe.cfg.aa, up: pipe.cfg.upscaler, scale: pipe.scale, buf: [b.x, b.y] };
  });
  { const sh = await page.evaluate(() => window.__shots); const dir = Deno.env.get('SHOTS'); if (sh && dir) for (const [k, u] of Object.entries(sh)) Deno.writeFileSync(`${dir}/post-${map}-${k}.png`, Uint8Array.from(atob(u.split(',')[1]), (c) => c.charCodeAt(0))); }
  if (res.err) console.log(res.err); else { const m = (L) => L.reduce((x, y) => x + y, 0) / L.length;
    console.log(`${preset} ${map}: ${res.aa}+${res.up}, буфер ${res.buf.join('×')}, масштаб ${res.scale}: два прохода ${m(res.two).toFixed(3)} мс [${res.two.map((x) => x.toFixed(2))}] · один ${m(res.one).toFixed(3)} мс [${res.one.map((x) => x.toFixed(2))}]`); }
} finally { await browser.close(); }
