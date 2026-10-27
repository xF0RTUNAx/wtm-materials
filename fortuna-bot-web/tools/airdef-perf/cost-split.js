// Сколько видеокарты берёт каждая часть кадра (2026-10-27, Mark: «что ещё можно сделать для уменьшения нагрузки»): кадр как в игре — pipe.render
// (сцена, слои эффектов, постобработка) по таймеру ГП; по очереди скрываем группу верхнего уровня сцены и мерим, насколько кадр стал дешевле.
// Тени — отдельно (карта теней каждый кадр против ни разу). Экран телефона 844×390 в горизонтали, виды — как в frame-ab.js.
//   deno run -A tools/airdef-perf/cost-split.js [карта = autumn] [пресет = medium]; Q= — доп. параметры адреса (&weather=…)
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [map = 'autumn', preset = 'medium'] = Deno.args;
const VIEWS0 = { autumn: [[0, 9000, 80, 180, -12], [0, 9000, 1500, 180, -25], [-3000, 2000, 400, 120, -20]], winter: [[0, 6000, 80, 180, -10], [0, 6000, 1800, 180, -25], [3000, 0, 300, 220, -18]], city: [[2000, 9000, 80, 180, -10], [0, 9000, 2500, 180, -28], [-4000, 3000, 300, 120, -18]] }[map];
const VIEWS = [null, ...VIEWS0], Q = Deno.env.get('Q') || '';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 900000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=844,390', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--enable-webgl-draft-extensions', '--enable-privileged-webgl-extensions'] });
try {
  const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true });
  await page.evaluateOnNewDocument((p) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'air', diff: 'arcade', era: 4, side: 'west' })); localStorage.setItem('fortuna_airdef_gfx', p); }, preset);
  await page.goto(`http://127.0.0.1:${Deno.env.get('PORT') || 8937}/fortuna-bot-web/games/airdef.html?test=1&touch=1&map=${map}${/weather=/.test(Q) ? '' : '&weather=day'}&go=air${Q}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
  for (let i = 0; i < 150; i++) { const l = await page.evaluate(() => { const e = document.getElementById('assetLoad'); return e && e.classList.contains('on'); }); if (!l && i > 8) break; await new Promise((r) => setTimeout(r, 1000)); }
  await new Promise((r) => setTimeout(r, 5000));
  const res = await page.evaluate(async (VIEWS) => {
    const C = window.__a, R = C.renderer, gl = R.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'), G = C.G, cam = C.camera, pipe = C.pipe;
    window.requestAnimationFrame = () => 0; let t = performance.now();
    C.paused = false; for (let i = 0; i < 30; i++) { t += 34; window.__frame(t); } C.paused = true;
    const draw = () => { if (pipe) pipe.render(C.scene, cam, t / 1000); else { R.setRenderTarget(null); R.render(C.scene, cam); } };
    const gpu = async (f, n = 4) => { const a = []; for (let s = 0; s < 9; s++) { gl.finish(); const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); for (let k = 0; k < n; k++) f(); gl.endQuery(ext.TIME_ELAPSED_EXT); gl.finish();
      for (let w = 0; w < 80 && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE); w++) await new Promise((r) => setTimeout(r, 2)); if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) a.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / n / 1e6); gl.deleteQuery(q); }
      a.sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
    // группы верхнего уровня: известные части города — по ссылкам G, остальное — по имени или типу
    // подпись группы без имени — по содержимому: тип и материалы потомков (сколько сеток)
    const sig = (o) => { const ms = new Map(); o.traverse((c) => { if (c.isMesh || c.isPoints || c.isLine) { const k = (c.isInstancedMesh ? 'Inst:' : '') + (c.material && c.material.type || c.type); ms.set(k, (ms.get(k) || 0) + 1); } });
      return `${o.type}[${[...ms].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, n]) => `${k}×${n}`).join(',')}]`; };
    const label = (o) => o === G.ground ? 'земля' : o === G.sky ? 'небо' : o === G.clouds ? 'облака' : o === G.roads ? 'дороги' : o === G.snow?.pts ? 'снегопад'
      : (G.tiles || []).includes(o) ? 'кварталы и лес (плитки)' : o.isLight ? null : o.name ? o.name : sig(o);
    const groups = new Map(); for (const o of C.scene.children) { const l = label(o); if (!l || !o.visible) continue; if (!groups.has(l)) groups.set(l, []); groups.get(l).push(o); }
    const cam0 = C.ctrl.camera, out = [];
    for (const V of VIEWS) {
      if (!V) { C.ctrl.camera = cam0; } else { const [x, z, h, yaw, pitch] = V; C.ctrl.camera = () => { cam.position.set(x, C.city.groundH(x, z) + h, z); cam.rotation.set(pitch * Math.PI / 180, yaw * Math.PI / 180, 0, 'YXZ'); cam.updateMatrixWorld(); }; }
      for (let i = 0; i < 3; i++) { t += 34; window.__frame(t); } C.ctrl.camera(); if (G.bake) G.bake.flush(cam);
      const vis = new Map(); for (const [, os] of groups) for (const o of os) vis.set(o, o.visible); // как после кадра (плитки вдали скрыты)
      const sh = R.shadowMap; const shA = sh.autoUpdate;
      sh.autoUpdate = false; for (let k = 0; k < 6; k++) draw();
      // разница «с / без» — по очереди, 3 раунда, медиана (частота видеокарты гуляет)
      const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
      const ab = async (on, off) => { const d = []; for (let r = 0; r < 3; r++) { on(); const a = await gpu(draw, 3); off(); const b = await gpu(draw, 3); on(); d.push(a - b); } return med(d); };
      const base = await gpu(draw);
      const shadow = sh.enabled ? await ab(() => { sh.autoUpdate = true; }, () => { sh.autoUpdate = false; }) : 0; sh.autoUpdate = false;
      const sceneOnly = await gpu(() => { R.setRenderTarget(pipe ? pipe.target : null); R.render(C.scene, cam); });
      const parts = [];
      for (const [l, os] of groups) { if (!os.some((o) => vis.get(o))) continue; parts.push([l, await ab(() => { for (const o of os) o.visible = vis.get(o); }, () => { for (const o of os) o.visible = false; })]); for (const o of os) o.visible = vis.get(o); }
      sh.autoUpdate = shA; parts.sort((a, b) => b[1] - a[1]);
      out.push({ base, shadow, post: base - sceneOnly, parts: parts.filter((p) => p[1] > 0.02).slice(0, 9) });
    }
    C.ctrl.camera = cam0;
    return { out, px: [R.domElement.width, R.domElement.height], pr: R.getPixelRatio(), shadows: R.shadowMap.enabled, shEvery: C.P ? C.P.shEvery : null };
  }, VIEWS);
  const f = (x) => x.toFixed(2);
  console.log(`${map} ${preset}: холст ${res.px.join('×')} (×${res.pr}), тени ${res.shadows ? 'да' : 'нет'}`);
  res.out.forEach((o, i) => console.log(`  ${['за самолётом', 'низко', 'высоко', 'вбок'][i]}: кадр ${f(o.base)} мс (без обновления теней) · карта теней +${f(o.shadow)} · слои эффектов и постобработка ${f(o.post)} · ` + o.parts.map(([l, v]) => `${l} ${f(v)}`).join(' · ')));
  console.log('ошибки:', errs.slice(0, 2).join(' | ') || 'нет');
} finally { await browser.close(); }
