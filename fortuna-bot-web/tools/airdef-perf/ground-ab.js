// A/B земли вдали (uFar 1/0 на одной странице, по очереди 4 круга): цена шейдера земли на видеокарте: в сцене видны только земля и свет, камера в трёх точках (низко, высоко, вбок), 10 отрисовок в буфер кадра
// под таймером ГП, медиана 15 замеров. deno run -A ground-cost.js <карта> [пресет=medium]   Q='&tn=0' — прежний шум
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [map = 'autumn', preset = 'medium'] = Deno.args;
const VIEWS = { autumn: [[0, 9000, 80, 180, -12], [0, 9000, 1500, 180, -25], [-3000, 2000, 400, 120, -20]], winter: [[0, 6000, 80, 180, -10], [0, 6000, 1800, 180, -25], [3000, 0, 300, 220, -18]], city: [[2000, 9000, 80, 180, -10], [0, 9000, 2500, 180, -28], [-4000, 3000, 300, 120, -18]] }[map];
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 900000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=844,390', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--enable-webgl-draft-extensions', '--enable-privileged-webgl-extensions'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true });
  await page.evaluateOnNewDocument((p) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'air', diff: 'arcade', era: 4, side: 'west' })); localStorage.setItem('fortuna_airdef_gfx', p); }, preset);
  await page.goto(`http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?test=1&touch=1&map=${map}&weather=day&go=air${Deno.env.get('Q') || ''}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
  for (let i = 0; i < 150; i++) { const l = await page.evaluate(() => { const e = document.getElementById('assetLoad'); return e && e.classList.contains('on'); }); if (!l && i > 8) break; await new Promise((r) => setTimeout(r, 1000)); }
  await new Promise((r) => setTimeout(r, 3000));
  const res = await page.evaluate(async (VIEWS, VARS) => {
    const C = window.__a, R = C.renderer, gl = R.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'), G = C.G;
    window.requestAnimationFrame = () => 0; C.paused = true; let t = performance.now();
    for (let i = 0; i < 4; i++) { t += 34; window.__frame(t); }
    const vis = new Map(); C.scene.traverse((o) => { if (o !== C.scene && !o.isLight && o !== G.ground) { vis.set(o, o.visible); } });
    for (const o of vis.keys()) if (!o.children.some((q) => q === G.ground || q.isLight)) o.visible = false;
    let p = G.ground; while (p) { p.visible = true; p = p.parent; }
    const cam = C.camera, target = C.pipe ? C.pipe.target : null, out = [];
    const FU = G.ground.material.userData.farU; if (!FU) return { err: 'нет farU' };
    { const p = R.properties.get(G.ground.material); window.__sh5 = !!(p && p.program && /sh5/.test(R.getContext().getShaderSource(p.program.fragmentShader) || '')); }
    const VAR = JSON.parse(VARS), res2 = VAR.map(() => [[], [], []]), AT = G.ground.material.userData.AT || {};
    const apply = (v) => { const rs = v.rs !== 0; if (G.ground.receiveShadow !== rs) { G.ground.receiveShadow = rs; G.ground.material.needsUpdate = true; } FU.value = v.far; for (const [nm, u] of Object.entries(AT)) { const t = u.value, an = v.anC && /^(aGA|aRA|aMA|wSA|wRA|tGA)$/.test(nm) ? v.anC : v.an; if (t && t.image && t.anisotropy !== an) { t.anisotropy = an; t.needsUpdate = true; } } };
    for (let round = 0; round < 3; round++) for (const [vk, v] of VAR.entries()) { apply(v); const on = vk;
    for (const [vi, V] of VIEWS.entries()) {
      const [x, z, h, yaw, pitch] = V; cam.position.set(x, C.city.groundH(x, z) + h, z); cam.rotation.set(pitch * Math.PI / 180, yaw * Math.PI / 180, 0, 'YXZ'); cam.updateMatrixWorld();
      R.setRenderTarget(target); for (let k = 0; k < 20; k++) R.render(C.scene, cam); gl.finish();
      const a = [];
      for (let s = 0; s < 15; s++) {
        const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); for (let k = 0; k < 10; k++) R.render(C.scene, cam); gl.endQuery(ext.TIME_ELAPSED_EXT); gl.finish();
        for (let w = 0; w < 50 && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE); w++) await new Promise((r) => setTimeout(r, 2));
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) a.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e7); gl.deleteQuery(q);
      }
      a.sort((u, v) => u - v); res2[on][vi].push(a[Math.floor(a.length / 2)]);
    } }
    const mean = (L) => L.reduce((x, y) => x + y, 0) / L.length;
    for (const [vk, v] of VAR.entries()) out.push(res2[vk].map(mean));
    // снимки: вид «высоко» и «низко» каждого варианта
    const shots = {};
    for (const [vk, v] of VAR.entries()) { apply(v); for (const vi of [0, 1]) { const [x, z, h, yaw, pitch] = VIEWS[vi]; cam.position.set(x, C.city.groundH(x, z) + h, z); cam.rotation.set(pitch * Math.PI / 180, yaw * Math.PI / 180, 0, 'YXZ'); cam.updateMatrixWorld();
      R.setRenderTarget(null); for (let k = 0; k < 3; k++) R.render(C.scene, cam); shots[vk + '_' + vi] = R.domElement.toDataURL('image/jpeg', 0.92); } }
    window.__shots = shots;
    R.setRenderTarget(null);
    const b = new THREE.Vector2(); R.getDrawingBufferSize(b);
    return { ms: out, buf: [b.x, b.y], tsize: target ? [target.width, target.height] : null };
  }, VIEWS, Deno.env.get('VARS') || '[{"far":0.25,"an":4},{"far":0,"an":4}]');
  console.log('ранний выход теней в шейдере земли:', await page.evaluate(() => window.__sh5));
  if (res.err) console.log(res.err); else { const VAR = JSON.parse(Deno.env.get('VARS') || '[{"far":0.25,"an":4},{"far":0,"an":4}]');
    VAR.forEach((v, k) => console.log(`${map} ${preset} far ${v.far} an ${v.an}${v.anC ? '/' + v.anC : ''}${v.rs === 0 ? ' без теней' : ''}: ` + res.ms[k].map((m, vi) => `${['низко', 'высоко', 'вбок'][vi]} ${m.toFixed(2)}`).join(' · ') + ` · сумма ${res.ms[k].reduce((a, b) => a + b, 0).toFixed(2)}`));
    const shots = await page.evaluate(() => window.__shots); const dir = Deno.env.get('SHOTS'); if (dir) for (const [k, u] of Object.entries(shots)) Deno.writeFileSync(`${dir}/${map}-${k}.jpg`, Uint8Array.from(atob(u.split(',')[1]), (c) => c.charCodeAt(0))); }
} finally { await browser.close(); }
