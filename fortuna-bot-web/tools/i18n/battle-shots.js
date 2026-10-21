// Снимки боя на выбранном языке: вылет, вертолёт на осенней карте, оборона (расстановка, волна, оператор, итоги волны),
// «Мульти-волна» (удар и ПВО), конец вылета. ПК 1280×720 и телефон горизонтально 844×390 (?touch=1).
//   deno run -A tools/i18n/battle-shots.js [lang=en] [pc|phone] [only=air,heli,def,multi]   (нужен сервер localhost:8935)
//   → tools/i18n/shots/battle-<устройство>-<кадр>.png
import puppeteer from 'npm:puppeteer-core@22.15.0';
const LANG = Deno.args.find((a) => /^(en|ru)$/.test(a)) || 'en', DEV = Deno.args.find((a) => /^(pc|phone)$/.test(a)) || 'pc';
const ONLY = (Deno.args.find((a) => a.startsWith('only=')) || 'only=air,heli,def,multi').slice(5).split(',');
const OUT = new URL('./shots/', import.meta.url).pathname, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const phone = DEV === 'phone';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errs = [];
async function open(query) {
  const p = await b.newPage();
  await p.setViewport(phone ? { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { width: 1280, height: 720 });
  p.on('pageerror', (e) => errs.push(query + ': ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(query + ': ' + m.text()); });
  await p.goto(`http://localhost:8935/fortuna-bot-web/games/airdef.html?lang=${LANG}&gfx=low&test=1${phone ? '&touch=1' : ''}&${query}`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__a && !document.getElementById('loading'), { timeout: 300000, polling: 500 });
  return p;
}
const shot = async (p, name) => { await sleep(500); await p.screenshot({ path: `${OUT}battle-${DEV}-${name}.png` }); console.log('снимок', name); };
const click = async (p, sel) => { await p.evaluate((s) => { const e = document.querySelector(s); if (e) e.click(); }, sel); await sleep(400); };
// самолёт
if (ONLY.includes('air')) {
  const p = await open('go=air'); await sleep(9000); await shot(p, 'air-hud');
  await p.evaluate(() => window.__a.ctrl && window.__a.ctrl.pauseHelp && 0);
  await click(p, '#pause'); await sleep(600); await shot(p, 'air-pause');
  await click(p, '#pauseEnd'); await sleep(2500); await shot(p, 'air-end');
  await p.close();
}
// вертолёт на осенней карте
if (ONLY.includes('heli')) {
  const p = await open('map=autumn&heli=h_mi24&go=air'); await sleep(9000); await shot(p, 'heli-hud');
  await p.close();
}
// оборона
if (ONLY.includes('def')) {
  const p = await open('go=defense'); await sleep(4000); await shot(p, 'def-plan');
  await p.evaluate(() => { const C = window.__a, D = C.ctrls.defense, t = C.S.objects.find((o) => o.key === 'tpp') || C.S.objects[0]; for (const [k, dx] of [['osa', 500], ['m163', 300], ['igla', 400]]) { const u = C.S.addUnit(k, t.x + dx, t.z + 200, {}); u.paid = 100; } C.syncUnits(); D.startWave(); }); await sleep(9000); await shot(p, 'def-wave');
  await p.evaluate(() => { const C = window.__a, D = C.ctrls.defense; D.enterOp(C.S.units[0]); }); await sleep(3500); await shot(p, 'def-op');
  await p.evaluate(() => { const C = window.__a, D = C.ctrls.defense; D.leaveOp(); for (const a of C.raid.planes) { a.hp = 0; a.dead = true; } }); await sleep(5000); await shot(p, 'def-results');
  await p.close();
}
// «Мульти-волна»: удар и ПВО
if (ONLY.includes('multi')) {
  for (const role of ['atk', 'def']) {
    const p = await open('go=defense');
    await p.evaluate((r) => { const C = window.__a; C.toMenu(); C.setup.era = 4; C.setup.side = 'east'; C.setup.mrole = r; C.setup.game = 'multi'; C.start('multi'); }, role);
    await sleep(4000); await shot(p, `multi-${role}-plan`);
    if (role === 'atk') await p.evaluate(() => { const M = window.__a.ctrl, st = M.st; Object.assign(st.plan.n, { shahed: 6, kh555: 2, kalibr: 2 }); M.renderSide && M.renderSide(); });
    await sleep(800); if (role === 'atk') await shot(p, 'multi-atk-plan2');
    await p.evaluate(() => { window.__a.ctrl.startWave(); }); await sleep(12000); await shot(p, `multi-${role}-wave`);
        if (role === 'atk') { // итог волны: один дрон, время ×4 — ждём конец боя
      await p.close(); const q = await open('go=defense');
      await q.evaluate(() => { const C = window.__a; C.toMenu(); C.setup.era = 4; C.setup.side = 'east'; C.setup.mrole = 'atk'; C.setup.game = 'multi'; C.start('multi'); });
      await sleep(3000);
      await q.evaluate(() => { const M = window.__a.ctrl, st = M.st; Object.assign(st.plan.n, { shahed: 1 }); st.plan.cfg.shahed = { pts: [], alt: null, t: null, sam: false, tgt: st.targets[0].id, units: [] }; M.startWave(); st.timeK = 4; });
      await q.waitForFunction(() => window.__a.ctrl.st.over, { timeout: 400000, polling: 1000 }).catch(() => console.log('итог волны не дождались'));
      await sleep(1500); await shot(q, 'multi-atk-results'); await q.close(); continue;
    }
    await p.close();
  }
}
await b.close();
console.log('ошибки страницы:', errs.length ? '\n' + errs.join('\n') : 'нет');
