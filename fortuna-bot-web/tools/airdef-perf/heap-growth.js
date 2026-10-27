// Растёт ли память в бою: полёт с «пилотом» (высоты, пуски, ловушки) N секунд, куча JS после принудительной сборки мусора раз в 30 с.
//   deno run -A leak.js [go=air] [сек=300] [Q доп. параметры]
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [go = 'air', secS = '300', extra = ''] = Deno.args;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 900000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=844,390', '--js-flags=--expose-gc', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
try {
  const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true });
  await page.evaluateOnNewDocument((g) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: g, diff: 'arcade', era: 3, side: 'east', mrole: 'atk' })); localStorage.setItem('fortuna_airdef_gfx', 'medium'); }, go);
  await page.goto(`http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?test=1&touch=1&go=${go}&weather=day${extra}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
  await page.evaluate(() => {
    const C = window.__a, ALTS = [150, 2500, 400, 6000, 900, 3500, 250]; let tk = 0, ai = 0;
    setInterval(() => { const A = C.ctrl; if (!A || !A.craft || !A.demo || C.state !== 'play') return; if (C.paused && C.togglePause) C.togglePause(); tk++;
      const g = A.game, tg = (g && g.targets || []).find((o) => !o.dead) || { x: 0, z: 0 };
      if (tk % 12 === 1) { ai++; A.demo({ pt: { x: tg.x, z: tg.z }, alt: ALTS[ai % ALTS.length] }); }
      if (tk % 4 === 0 && A.fire) A.fire(true); if (tk % 6 === 3 && A.cm) A.cm(true); if (tk % 20 === 10 && A.nextWeapon) A.nextWeapon();
      if (A.craft.dead && tk % 10 === 0) C.start(go); }, 1000);
  });
  const t0 = Date.now(), rows = [];
  while (Date.now() - t0 < +secS * 1000) {
    await new Promise((r) => setTimeout(r, 30000));
    const s = await page.evaluate(() => { window.gc && window.gc(); window.gc && window.gc(); const C = window.__a, R = C.renderer, m = R.info.memory, S = C.S;
      return { heap: Math.round(performance.memory.usedJSHeapSize / 1048576), geo: m.geometries, tex: m.textures, wp: S ? S.wpns.length : 0, sams: S ? S.sams.length : 0, kids: C.scene.children.length, objs: (() => { let n = 0; C.scene.traverse(() => n++); return n; })(), fps: C.fps }; });
    rows.push(s); console.log(`${Math.round((Date.now() - t0) / 1000)} с: куча ${s.heap} МБ · сцена ${s.kids} / ${s.objs} объектов · геом. ${s.geo} · текст. ${s.tex} · оружие ${s.wp} · ЗУР ${s.sams} · ${s.fps} к/с`);
  }
  if (errs.length) console.log('ошибки:', errs.slice(0, 3));
} finally { await browser.close(); }
