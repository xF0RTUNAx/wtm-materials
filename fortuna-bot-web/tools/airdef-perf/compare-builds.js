// Сборки рядом: «до оптимизации» (7c1f1d0, 20261022v), «на сайте» (2b556ed, 20261024u), «сейчас» (рабочая папка) — каждая в своей вкладке,
// один пресет и карта; виды одни и те же, разрешение задаётся (pixel ratio), замер — по очереди во вкладках (нагрев одинаковый), таймер ГП.
// Кадр = pipe.render (сцена + постобработка), тени — с частотой своей сборки (P.shEvery/shAuto). Окно ТВ не входит.
//   deno run -A compare-builds.js <пресет> <карта> <pr через запятую> [круги = 3] → строка JSON в stdout (и читаемая таблица в stderr)
// Старые сборки — чистые копии: `git archive <коммит> fortuna-bot-web | tar -x -C <папка>` и `python3 -m http.server 8941|8942` в ней; текущая — 8937.
// Сводка по всем строкам: python3 compare-builds-sum.py <файл.jsonl>. Итог 2026-10-25 — AIRDEF_STATE.md (журнал).
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [preset = 'medium', map = 'city', prArg = '1.25,1.75,2', roundsArg = '3'] = Deno.args, PRS = prArg.split(',').map(Number), ROUNDS = +roundsArg;
const BUILDS = [{ id: 'base', port: 8941 }, { id: 'site', port: 8942 }, { id: 'now', port: 8937 }];
const VIEWS = { autumn: [[0, 9000, 120, 180, -8], [0, 9000, 1500, 180, -25], [-3000, 2000, 3000, 120, -20]], winter: [[0, 6000, 120, 180, -8], [0, 6000, 1800, 180, -25], [3000, 0, 3000, 220, -18]],
  city: [[2000, 9000, 120, 180, -8], [0, 9000, 2500, 180, -28], [-4000, 3000, 3000, 120, -18]] }[map]; // низко (вертолёт), средне, высоко (самолёт)
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 1800000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=844,390', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--enable-webgl-draft-extensions', '--enable-privileged-webgl-extensions'] });
const out = { preset, map, prs: PRS, builds: {} };
try {
  const pages = [];
  for (const B of BUILDS) {
    const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true });
    await page.evaluateOnNewDocument((p) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'air', diff: 'arcade', era: 4, side: 'west' })); localStorage.setItem('fortuna_airdef_gfx', p); }, preset);
    await page.goto(`http://127.0.0.1:${B.port}/fortuna-bot-web/games/airdef.html?test=1&touch=1&map=${map}&weather=day&go=air`, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 240000, polling: 500 });
    pages.push({ B, page, errs });
  }
  for (const { page } of pages) { // догрузка моделей и текстур
    for (let i = 0; i < 150; i++) { const l = await page.evaluate(() => { const e = document.getElementById('assetLoad'); return e && e.classList.contains('on'); }); if (!l && i > 8) break; await new Promise((r) => setTimeout(r, 1000)); }
  }
  await new Promise((r) => setTimeout(r, 4000));
  for (const { page } of pages) await page.evaluate(() => {
    const C = window.__a, R = C.renderer, gl = R.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    window.requestAnimationFrame = () => 0; C.probeOn = true; window.__t = performance.now();
    C.paused = false; for (let i = 0; i < 20; i++) { window.__t += 16; window.__frame(window.__t); } C.paused = true; // самолёт в полёте
    const cam = C.camera;
    window.__m = async (V, pr, N) => {
      const [x, z, h, yaw, pitch] = V, put = () => { cam.position.set(x, C.city.groundH(x, z) + h, z); cam.rotation.set(pitch * Math.PI / 180, yaw * Math.PI / 180, 0, 'YXZ'); cam.updateMatrixWorld(); };
      C.ctrl.camera = put; for (let i = 0; i < 4; i++) { window.__t += 34; window.__frame(window.__t); } put(); // шаг 34 мс: у старых сборок на паузе кадр не чаще 30 к/с
      if (R.getPixelRatio() !== pr || (C.pipe && C.pipe.scale !== 1)) { R.setPixelRatio(pr); if (C.pipe && C.pipe.scale !== 1) C.pipe.setScale(1); C.resize(); } // динамическое разрешение — снять
      const P = C.P || {}, k = P.shEvery > 1 && (!P.shAuto || h > 150) ? P.shEvery : 1, sh = R.shadowMap, au = sh.autoUpdate;
      let n = 0; const one = () => { if (sh.enabled) { if (k > 1) { sh.autoUpdate = false; sh.needsUpdate = n % k === 0; } else sh.autoUpdate = true; } n++; if (C.pipe) C.pipe.render(C.scene, cam, window.__t / 1000); else { R.setRenderTarget(null); R.render(C.scene, cam); } };
      const timed = async (K) => { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); for (let i = 0; i < K; i++) one(); gl.endQuery(ext.TIME_ELAPSED_EXT); gl.finish();
        for (let w = 0; w < 60 && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE); w++) await new Promise((r) => setTimeout(r, 2));
        const v = gl.getParameter(ext.GPU_DISJOINT_EXT) ? null : gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6 / K; gl.deleteQuery(q); return v; };
      for (let i = 0; i < 6; i++) one(); gl.finish();
      // повторов в замере — чтобы видеокарта работала ≥ 40 мс подряд (иначе на лёгком кадре сбрасывает частоту, разброс ±40 %)
      const est = (await timed(6)) || 1, K = Math.max(6, Math.min(60, Math.ceil(40 / est)));
      for (let i = 0; i < K; i++) one(); gl.finish();
      const a = [];
      for (let s = 0; s < N; s++) { const v = await timed(K); if (v !== null) a.push(v); }
      a.sort((u, v) => u - v);
      R.info.autoReset = false; R.info.reset(); one(); const calls = R.info.render.calls, tris = R.info.render.triangles; R.info.reset();
      sh.autoUpdate = au; const b = new THREE.Vector2(); R.getDrawingBufferSize(b);
      return { ms: a[Math.floor(a.length / 2)], calls, tris, buf: [b.x, b.y], sh: k, K };
    };
  });
  const res = {}; for (const { B } of pages) res[B.id] = {};
  for (let r = 0; r < ROUNDS; r++) for (const pr of PRS) for (const [vi, V] of VIEWS.entries()) for (const { B, page } of pages) {
    const m = await page.evaluate((V, pr) => window.__m(V, pr, 9), V, pr), key = `${pr}|${vi}`;
    (res[B.id][key] = res[B.id][key] || []).push(m);
  }
  for (const { B, errs } of pages) {
    out.builds[B.id] = { errs: errs.slice(0, 3), cells: {} };
    for (const [key, L] of Object.entries(res[B.id])) { const ms = L.map((x) => x.ms).sort((a, b) => a - b); out.builds[B.id].cells[key] = { ms: ms[Math.floor(ms.length / 2)], all: ms.map((x) => +x.toFixed(2)), calls: L[0].calls, tris: L[0].tris, buf: L[0].buf, sh: L[0].sh }; }
  }
  // читаемо: по разрешению — сумма трёх видов
  for (const pr of PRS) {
    const sum = (id) => [0, 1, 2].reduce((s, vi) => s + out.builds[id].cells[`${pr}|${vi}`].ms, 0), b = sum('base');
    console.error(`${preset} ${map} ×${pr} (${out.builds.now.cells[`${pr}|0`].buf.join('×')}): до ${b.toFixed(2)} · сайт ${sum('site').toFixed(2)} (${((sum('site') / b - 1) * 100).toFixed(0)} %) · сейчас ${sum('now').toFixed(2)} (${((sum('now') / b - 1) * 100).toFixed(0)} %) мс на 3 вида · вызовов ${['base', 'site', 'now'].map((id) => out.builds[id].cells[`${pr}|1`].calls).join('/')}`);
  }
  for (const { B, errs } of pages) if (errs.length) console.error(B.id, 'ошибки:', errs.slice(0, 2).join(' | '));
  console.log(JSON.stringify(out));
} finally { await browser.close(); }
