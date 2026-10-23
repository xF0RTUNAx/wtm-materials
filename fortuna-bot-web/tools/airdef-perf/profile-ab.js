// Профиль ЦП «Воздушного превосходства»: Chrome без окна (видеокарта Мака), телефон в горизонтали (touch), вылет над городом.
//   deno run -A profile.js <пресет> [секунды] [map] [game]
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [preset = 'medium', secS = '15', map = 'city', game = 'air'] = Deno.args, SEC = +secS;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=915,412', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const page = await browser.newPage();
await page.setViewport({ width: 915, height: 412, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, isLandscape: true });
await page.evaluateOnNewDocument((preset, game) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game, diff: 'arcade', era: 3, side: 'east' })); localStorage.setItem('fortuna_airdef_gfx', preset); localStorage.setItem('fortuna_airdef_perfhud', '1'); }, preset, game);
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://127.0.0.1:${Deno.env.get('PORT') || '8937'}/fortuna-bot-web/games/airdef.html?test=1&touch=1&map=${map}&weather=day&go=${game}`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
// догрузка моделей и текстур
for (let i = 0; i < 120; i++) { const l = await page.evaluate(() => { const e = document.getElementById('assetLoad'); return e && e.classList.contains('on'); }); if (!l && i > 6) break; await new Promise((r) => setTimeout(r, 1000)); }
await page.evaluate(() => { const C = window.__a; try { C.snd && C.snd.unlock && C.snd.unlock(); } catch (_) {} if (C.setAuto) C.setAuto(true); });
await new Promise((r) => setTimeout(r, 4000));
const cdp = await page.target().createCDPSession();
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
const fps0 = await page.evaluate(() => { const C = window.__a; return { f: C.renderer ? C.renderer.info.render.frame : 0, t: performance.now() }; });
await cdp.send('Profiler.start');
const perfTxt = [];
for (let s = 0; s < SEC; s += 3) { await new Promise((r) => setTimeout(r, 3000)); perfTxt.push(await page.evaluate(() => (document.getElementById('perf') || {}).textContent || '')); }
const { profile } = await cdp.send('Profiler.stop');
const fps1 = await page.evaluate(() => { const C = window.__a; return { f: C.renderer ? C.renderer.info.render.frame : 0, t: performance.now(), calls: C.renderer ? C.renderer.info.render.calls : 0, tris: C.renderer ? C.renderer.info.render.triangles : 0, geo: C.renderer ? C.renderer.info.memory.geometries : 0, tex: C.renderer ? C.renderer.info.memory.textures : 0, state: C.state, paused: C.paused }; });
// self-время по функциям (url:строка) и «всего» по поддеревьям
const byId = new Map(profile.nodes.map((n) => [n.id, n])), dt = profile.timeDeltas, smp = profile.samples, self = new Map();
const total = dt.reduce((s, v) => s + v, 0);
for (let i = 0; i < smp.length; i++) self.set(smp[i], (self.get(smp[i]) || 0) + dt[i]);
const key = (n) => { const f = n.callFrame; const u = f.url.split('/').pop().split('?')[0]; return `${f.functionName || '(anon)'} ${u}:${f.lineNumber + 1}`; };
const agg = new Map(); for (const [id, t] of self) { const k = key(byId.get(id)); agg.set(k, (agg.get(k) || 0) + t); }
// включительное время: сумма self по поддереву
const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
const incl = new Map(); for (const [id, t] of self) { const seen = new Set(); let cur = id; while (cur !== undefined) { const k = key(byId.get(cur)); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + t); } cur = parent.get(cur); } }
const pct = (t) => (100 * t / total).toFixed(1).padStart(5) + '%';
console.log(`== ${preset} · ${map} · ${game}: кадров ${fps1.f - fps0.f} за ${((fps1.t - fps0.t) / 1000).toFixed(1)} с → ${((fps1.f - fps0.f) / ((fps1.t - fps0.t) / 1000)).toFixed(1)} к/с · выз. ${fps1.calls} · тр. ${(fps1.tris / 1e6).toFixed(2)} млн · геом ${fps1.geo} · текст ${fps1.tex} · ${fps1.state}${fps1.paused ? ' (пауза!)' : ''}`);
console.log('HUD:', perfTxt.slice(-2).join(' | '));
const idle = [...agg].filter(([k]) => /^\((idle|program|garbage collector)\)/.test(k)).map(([k, t]) => `${k.split(' ')[0]} ${pct(t)}`).join(' · ');
console.log('простой/служебное:', idle);
console.log('\n— self (своё время), топ 35:'); for (const [k, t] of [...agg].filter(([k]) => !/^\((idle|program|root)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 35)) console.log(pct(t), k);
console.log('\n— включительно, топ 45:'); for (const [k, t] of [...incl].filter(([k]) => !/^\((idle|program|root)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 45)) console.log(pct(t), k);
if (errs.length) console.log('ошибки страницы:', errs.slice(0, 3));
await browser.close();
