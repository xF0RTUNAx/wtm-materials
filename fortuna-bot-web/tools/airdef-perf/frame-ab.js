// весь кадр (сцена без постобработки) по таймеру ГП: варианты по очереди на одной странице. VARS — JSON: [{"ro":0},{"ro":1}] (порядок земли)
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [map = 'autumn', preset = 'high'] = Deno.args;
const VIEWS0 = { autumn: [[0, 9000, 80, 180, -12], [0, 9000, 1500, 180, -25], [-3000, 2000, 400, 120, -20]], winter: [[0, 6000, 80, 180, -10], [0, 6000, 1800, 180, -25], [3000, 0, 300, 220, -18]], city: [[2000, 9000, 80, 180, -10], [0, 9000, 2500, 180, -28], [-4000, 3000, 300, 120, -18]] }[map];
const VIEWS = [null, ...VIEWS0];
const VARS = Deno.env.get('VARS') || '[{"ro":0},{"ro":1}]';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 900000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=844,390', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--enable-webgl-draft-extensions', '--enable-privileged-webgl-extensions'] });
try {
  const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true });
  await page.evaluateOnNewDocument((p) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'air', diff: 'arcade', era: 4, side: 'west' })); localStorage.setItem('fortuna_airdef_gfx', p); }, preset);
  await page.goto(`http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?test=1&touch=1&map=${map}&weather=day&go=air${Deno.env.get('Q') || ''}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
  for (let i = 0; i < 150; i++) { const l = await page.evaluate(() => { const e = document.getElementById('assetLoad'); return e && e.classList.contains('on'); }); if (!l && i > 8) break; await new Promise((r) => setTimeout(r, 1000)); }
  await new Promise((r) => setTimeout(r, 3000));
  const res = await page.evaluate(async (VIEWS, VARS) => {
    const C = window.__a, R = C.renderer, gl = R.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'), G = C.G;
    window.requestAnimationFrame = () => 0; C.paused = true; let t = performance.now();
    const cam = C.camera, target = C.pipe ? C.pipe.target : null, VAR = JSON.parse(VARS), out = VAR.map(() => VIEWS.map(() => [])), cam0 = C.ctrl.camera;
    C.paused = false; for (let i = 0; i < 30; i++) { t += 34; window.__frame(t); } C.paused = true; // самолёт в полёте
    const M = G.ground.material, FU = M.userData.farU, AT = M.userData.AT || M.userData.WT || {}, city = !M.userData.WT && !/aGA/.test(Object.keys(AT).join());
    const apply = (v) => { G.ground.renderOrder = v.ro || 0; if (FU) FU.value = v.far ?? FU.value;
      if (v.an) for (const [nm, u] of Object.entries(AT)) { const t = u && u.value; if (!t || !t.isTexture) continue;
        const coarse = /^(aGA|aRA|aMA|wSA|wRA|tGA)$/.test(nm), an = v.old ? v.an : coarse ? 1 : city ? v.an : Math.min(4, v.an);
        if (t.anisotropy !== an) { t.anisotropy = an; t.needsUpdate = true; } } };
    for (let round = 0; round < 3; round++) for (const [vk, v] of VAR.entries()) { apply(v);
      for (const [vi, V] of VIEWS.entries()) {
        let put;
        if (!V) { C.ctrl.camera = cam0; for (let i = 0; i < 3; i++) { t += 34; window.__frame(t); } } // за самолётом — камера игры
        else { const [x, z, h, yaw, pitch] = V; put = () => { cam.position.set(x, C.city.groundH(x, z) + h, z); cam.rotation.set(pitch * Math.PI / 180, yaw * Math.PI / 180, 0, 'YXZ'); cam.updateMatrixWorld(); };
          C.ctrl.camera = put; for (let i = 0; i < 3; i++) { t += 34; window.__frame(t); } put(); } // точка вида; город подстраивается (дома вблизи, деревья)
        R.setRenderTarget(target); for (let k = 0; k < 8; k++) R.render(C.scene, cam); gl.finish();
        const a = [];
        for (let s = 0; s < 11; s++) { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); for (let k = 0; k < 6; k++) R.render(C.scene, cam); gl.endQuery(ext.TIME_ELAPSED_EXT); gl.finish();
          for (let w = 0; w < 50 && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE); w++) await new Promise((r) => setTimeout(r, 2));
          if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) a.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 6e6); gl.deleteQuery(q); }
        a.sort((u, w) => u - w); out[vk][vi].push(a[Math.floor(a.length / 2)]);
      } }
    // снимки: каждый вариант, вид «низко» и «вбок» — в экранный буфер без постобработки
    const shots = {}; for (const [vk, v] of VAR.entries()) { apply(v); for (const vi of [1, 3]) { const [x, z, h, yaw, pitch] = VIEWS[vi], put = () => { cam.position.set(x, C.city.groundH(x, z) + h, z); cam.rotation.set(pitch * Math.PI / 180, yaw * Math.PI / 180, 0, 'YXZ'); cam.updateMatrixWorld(); };
      C.ctrl.camera = put; for (let i = 0; i < 2; i++) { t += 34; window.__frame(t); } put(); R.setRenderTarget(null); R.render(C.scene, cam); shots[vk + '_' + vi] = R.domElement.toDataURL('image/png'); } }
    window.__shots = shots;
    apply(VAR[0]); R.setRenderTarget(null);
    const m = (L) => L.reduce((x, y) => x + y, 0) / L.length;
    return out.map((v) => v.map(m));
  }, VIEWS, VARS);
  JSON.parse(VARS).forEach((v, k) => console.log(`${map} ${preset} ${JSON.stringify(v)}: ` + res[k].map((x, vi) => `${['за самолётом', 'низко', 'высоко', 'вбок'][vi]} ${x.toFixed(2)}`).join(' · ') + ` · сумма ${res[k].reduce((a, b) => a + b, 0).toFixed(2)} мс`));
  { const sh = await page.evaluate(() => window.__shots); const dir = Deno.env.get('SHOTS'); if (sh && dir) for (const [k, u] of Object.entries(sh)) Deno.writeFileSync(`${dir}/fr-${map}-${preset}-${k}.png`, Uint8Array.from(atob(u.split(',')[1]), (c) => c.charCodeAt(0))); }
  console.log('ошибки:', errs.slice(0, 2).join(' | ') || 'нет');
} finally { await browser.close(); }
