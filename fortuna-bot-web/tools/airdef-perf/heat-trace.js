// Куда уходит главный поток страницы в бою (не только JS): стиль, раскладка, отрисовка DOM, сборка мусора, композиция — трасса Chrome.
// Телефон в горизонтали (915×412, dpr 2,625), бой на автопилоте.   deno run -A heat-trace.js [пресет=medium] [карта=city] [игра=air] [с=8]
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [preset = 'medium', map = 'city', game = 'air', secS = '8'] = Deno.args;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=915,412', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
try {
  const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 915, height: 412, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, isLandscape: true });
  await page.evaluateOnNewDocument((p, g) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: g, diff: 'arcade', era: 3, side: 'east' })); localStorage.setItem('fortuna_airdef_gfx', p); }, preset, game);
  const q = Deno.env.get('Q') || '';
  await page.goto(`http://127.0.0.1:${Deno.env.get('PORT') || '8937'}/fortuna-bot-web/games/airdef.html?test=1&touch=1&map=${map}&weather=day&go=${game}${q}`, { waitUntil: 'load', timeout: 120000 });
  if (game === 'menu') await new Promise((r) => setTimeout(r, 15000));
  else {
    await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
    for (let i = 0; i < 120; i++) { const l = await page.evaluate(() => { const e = document.getElementById('assetLoad'); return e && e.classList.contains('on'); }); if (!l && i > 6) break; await new Promise((r) => setTimeout(r, 1000)); }
    await page.evaluate(() => { const C = window.__a; if (C.setAuto) C.setAuto(true); });
    await new Promise((r) => setTimeout(r, 4000));
  }
  if (Deno.env.get('PRE')) await page.evaluate(Deno.env.get('PRE'));
  await page.tracing.start({ categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8', 'blink.user_timing', 'cc', 'gpu', 'viz'] });
  await new Promise((r) => setTimeout(r, +secS * 1000));
  const buf = await page.tracing.stop();
  const ev = JSON.parse(new TextDecoder().decode(buf)).traceEvents;
  // главный поток страницы — CrRendererMain того процесса, где есть FireAnimationFrame
  const names = {}; for (const e of ev) if (e.name === 'thread_name') names[e.pid + ':' + e.tid] = e.args.name;
  const raf = {}; for (const e of ev) if (e.name === 'FireAnimationFrame') raf[e.pid + ':' + e.tid] = (raf[e.pid + ':' + e.tid] || 0) + 1;
  const main = Object.entries(raf).sort((a, b) => b[1] - a[1])[0][0];
  const sum = (filt) => { const m = {}; for (const e of ev) if (e.ph === 'X' && e.dur && filt(e)) m[e.name] = (m[e.name] || 0) + e.dur / 1000; return m; };
  const span = +secS * 1000;
  // верхний уровень задач главного потока: RunTask — сколько всего поток был занят
  const top = sum((e) => e.pid + ':' + e.tid === main && (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask'));
  const inner = sum((e) => e.pid + ':' + e.tid === main && ['FunctionCall', 'FireAnimationFrame', 'TimerFire', 'EventDispatch', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'Commit', 'UpdateLayer', 'MajorGC', 'MinorGC', 'V8.GC_SCAVENGER', 'V8.GC_MARK_COMPACTOR', 'V8.GCScavenger', 'V8.GCFinalizeMC', 'HitTest', 'ParseHTML', 'RunMicrotasks', 'ScheduleStyleRecalculation', 'InvalidateLayout', 'UpdateLayerTree', 'PaintImage', 'Decode Image', 'GPUTask', 'CompositeLayers', 'BeginMainThreadFrame', 'ProxyMain::BeginMainFrame::commit'].includes(e.name));
  const counts = {}; for (const e of ev) if (e.pid + ':' + e.tid === main && ['UpdateLayoutTree', 'Layout', 'Paint', 'FireAnimationFrame', 'MinorGC', 'MajorGC'].includes(e.name) && e.ph === 'X') counts[e.name] = (counts[e.name] || 0) + 1;
  // остальные потоки: сколько каждый был занят (видеокарта Chrome, растр, композитор)
  const thr = {}; for (const e of ev) if (e.ph === 'X' && e.dur && (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask')) { const k = names[e.pid + ':' + e.tid] || e.tid; thr[k] = (thr[k] || 0) + e.dur / 1000; }
  const pct = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, (100 * v / span).toFixed(1) + '%']));
  const frames = counts.FireAnimationFrame || 0;
  console.log(JSON.stringify({ preset, map, game, sec: +secS, rafPerSec: +(frames / +secS).toFixed(1), mainBusy: pct(top), parts: pct(inner), counts, threads: pct(thr), errs: errs.slice(0, 3) }, null, 1));
  if (Deno.env.get('DOM')) { // какие элементы меняются каждый кадр: MutationObserver на 2 с
    const muts = await page.evaluate(() => new Promise((res) => { const m = {}; const o = new MutationObserver((l) => { for (const r of l) { const t = r.target.nodeType === 3 ? r.target.parentElement : r.target; const k = (t && (t.id || t.className || t.tagName)) + ' ' + r.type + (r.attributeName ? ':' + r.attributeName : ''); m[k] = (m[k] || 0) + 1; } }); o.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); setTimeout(() => { o.disconnect(); res(Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 25)); }, 2000); }));
    console.log('DOM-изменения за 2 с:', JSON.stringify(muts));
  }
} finally { await browser.close(); }
