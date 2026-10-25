// A/B текстур земли осени и зимы: KTX2 (tools/airdef-tex/ktx.js) против прежних JPEG на одной странице — в материале земли по очереди
// меняются значения униформ (те же текстуры, другой формат), цена земли на видеокарте под таймером ГП, медиана 15 замеров, 3 круга;
// снимки «низко» и «высоко» обоих вариантов — сравнить на глаз (и PSNR между ними).
//   deno run -A tools/airdef-perf/tex-ab.js <autumn|winter> [пресет=medium]     SHOTS=<папка> — сохранить снимки
// Mark 2026-10-25: «получится ещё сжать текстуры земли без значительной потери в качестве?»
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [map = 'autumn', preset = 'medium'] = Deno.args;
const VIEWS = { autumn: [[0, 9000, 80, 180, -12], [0, 9000, 1500, 180, -25], [-3000, 2000, 400, 120, -20]], winter: [[0, 6000, 80, 180, -10], [0, 6000, 1800, 180, -25], [3000, 0, 300, 220, -18]] }[map];
// униформа → файл tex/<имя>.jpg (как ATEX / WTEX в autumn-render.js и winter-render.js)
const FILES = { autumn: { aG: 'a_grass', aGN: 'a_grass_n', aGA: 'a_grassA', aL: 'a_leaves', aM: 'a_mud', aMA: 'a_mudA', aF: 'a_field', aRk: 'w_rock', aRA: 'w_rockA' },
  winter: { wSn: 'w_snow', wSnN: 'w_snow_n', wSA: 'w_snowA', wRk: 'w_rock', wRA: 'w_rockA', wIce: 'w_ice', wAs: 'w_asph' } }[map];
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 900000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=844,390', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--enable-webgl-draft-extensions', '--enable-privileged-webgl-extensions'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true });
  await page.evaluateOnNewDocument((p) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'air', diff: 'arcade', era: 4, side: 'west' })); localStorage.setItem('fortuna_airdef_gfx', p); }, preset);
  await page.goto(`http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?test=1&touch=1&map=${map}&weather=day&go=air`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
  for (let i = 0; i < 150; i++) { const l = await page.evaluate(() => { const e = document.getElementById('assetLoad'); return e && e.classList.contains('on'); }); if (!l && i > 8) break; await new Promise((r) => setTimeout(r, 1000)); }
  await new Promise((r) => setTimeout(r, 3000));
  const res = await page.evaluate(async (VIEWS, FILES) => {
    const C = window.__a, R = C.renderer, gl = R.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'), G = C.G;
    window.requestAnimationFrame = () => 0; C.paused = true; let t = performance.now();
    for (let i = 0; i < 4; i++) { t += 34; window.__frame(t); }
    const AT = G.ground.material.userData.AT || {};
    // KTX2 — то, что загрузила игра; JPEG — те же файлы, как раньше (ImageBitmap, мипы — видеокарта)
    const ktx = {}, jpg = {}, kinds = {};
    for (const [u, f] of Object.entries(FILES)) {
      const k = AT[u] && AT[u].value; if (!k) continue; ktx[u] = k; kinds[u] = k.isCompressedTexture ? 'ktx2' : 'jpg';
      const bmp = await fetch(`airdef/tex/${f}.jpg`).then((r) => r.blob()).then((b) => createImageBitmap(b));
      const j = new THREE.Texture(bmp); j.wrapS = j.wrapT = THREE.RepeatWrapping; j.anisotropy = k.anisotropy; j.minFilter = THREE.LinearMipmapLinearFilter; j.needsUpdate = true; jpg[u] = j;
    }
    const VAR = [['ktx2', ktx], ['jpg', jpg]], res2 = VAR.map(() => [[], [], []]);
    const vis = new Map(); C.scene.traverse((o) => { if (o !== C.scene && !o.isLight && o !== G.ground) vis.set(o, o.visible); });
    const cam = C.camera, target = C.pipe ? C.pipe.target : null;
    const apply = (set) => { for (const [u, tx] of Object.entries(set)) AT[u].value = tx; };
    const place = (V) => { const [x, z, h, yaw, pitch] = V; cam.position.set(x, C.city.groundH(x, z) + h, z); cam.rotation.set(pitch * Math.PI / 180, yaw * Math.PI / 180, 0, 'YXZ'); cam.updateMatrixWorld(); };
    // снимки всей сцены (как видит игрок) — до того, как спрятать остальное
    const shots = {};
    for (const [vk, [, set]] of VAR.entries()) { apply(set); for (const vi of [0, 1]) { place(VIEWS[vi]); R.setRenderTarget(null); for (let k = 0; k < 3; k++) R.render(C.scene, cam); shots[VAR[vk][0] + '_' + vi] = R.domElement.toDataURL('image/png'); } }
    // цена земли: в сцене только земля
    for (const o of vis.keys()) if (!o.children.some((q) => q === G.ground || q.isLight)) o.visible = false;
    let p = G.ground; while (p) { p.visible = true; p = p.parent; }
    for (let round = 0; round < 3; round++) for (const [vk, [, set]] of VAR.entries()) {
      apply(set);
      for (const [vi, V] of VIEWS.entries()) {
        place(V); R.setRenderTarget(target); for (let k = 0; k < 20; k++) R.render(C.scene, cam); gl.finish();
        const a = [];
        for (let s = 0; s < 15; s++) {
          const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); for (let k = 0; k < 10; k++) R.render(C.scene, cam); gl.endQuery(ext.TIME_ELAPSED_EXT); gl.finish();
          for (let w = 0; w < 50 && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE); w++) await new Promise((r) => setTimeout(r, 2));
          if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) a.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e7); gl.deleteQuery(q);
        }
        a.sort((u, v) => u - v); res2[vk][vi].push(a[Math.floor(a.length / 2)]);
      }
    }
    for (const [o, v] of vis) o.visible = v; apply(ktx); R.setRenderTarget(null);
    const mean = (L) => L.reduce((x, y) => x + y, 0) / L.length;
    window.__shots = shots;
    return { kinds, ms: VAR.map(([n], k) => [n, res2[k].map(mean)]) };
  }, VIEWS, FILES);
  console.log('формат у игры:', JSON.stringify(res.kinds));
  for (const [n, m] of res.ms) console.log(`${map} ${preset} ${n.padEnd(4)}: ` + m.map((v, vi) => `${['низко', 'высоко', 'вбок'][vi]} ${v.toFixed(2)} мс`).join(' · '));
  const [k0, j0] = [res.ms[0][1], res.ms[1][1]];
  console.log('KTX2 против JPEG: ' + k0.map((v, i) => `${(100 * (v / j0[i] - 1)).toFixed(1)} %`).join(' · '));
  const dir = Deno.env.get('SHOTS');
  if (dir) { const shots = await page.evaluate(() => window.__shots); for (const [k, u] of Object.entries(shots)) Deno.writeFileSync(`${dir}/${map}-${k}.png`, Uint8Array.from(atob(u.split(',')[1]), (c) => c.charCodeAt(0))); }
} finally { await browser.close(); }
