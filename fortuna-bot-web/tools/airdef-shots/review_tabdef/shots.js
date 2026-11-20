// shots.js - снимки табло онлайн-боя и расстановки обороны (заглушки rmock / omock, сервер :8935). Одна безголовая страница за раз.
//   deno run -A shots.js <сценарии через запятую> <phone|pc|both> <метка> [язык]
// сценарии: tab3 tab6 def_plan def_place multi_plan multi_place (расстановка и размещение в «Мульти-волне» за ПВО), net_plan net_place mdef_plan mdef_place (то же онлайн)
import puppeteer from 'npm:puppeteer-core@22.15.0';
const HERE = decodeURIComponent(new URL('.', import.meta.url).pathname);
const BASE = 'http://127.0.0.1:8935/fortuna-bot-web/games/airdef.html';
const SCR = (Deno.args[0] || 'tab3').split(','), DEV = Deno.args[1] || 'phone', TAG = Deno.args[2] || 'x', LANG = Deno.args[3] || '';
const PH = { width: 844, height: 390, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, PC = { width: 1600, height: 900, deviceScaleFactor: 1 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ACC = { id: 'rmock-xfortunax', login: 'xFORTUNAx', nick: 'xFORTUNAx' };
const SETUP = { game: 'defense', diff: 'arcade', era: 2, side: 'east', pmap: 'city' };
const QUERY = { tab3: 'test=1&rmock=1&prem=1&omock=battle', tab6: 'test=1&rmock=1&prem=1&omock=battle6', def_plan: 'test=1&rmock=1&go=defense&map=city', def_place: 'test=1&rmock=1&go=defense&map=city', multi_plan: 'test=1&rmock=1&go=defense&map=winter', multi_place: 'test=1&rmock=1&go=defense&map=winter', net_plan: 'test=1&rmock=1&omock=pvo', net_place: 'test=1&rmock=1&omock=pvo', mdef_plan: 'test=1&rmock=1&omock=mdef', mdef_place: 'test=1&rmock=1&omock=mdef' };
const place = async (p, dev) => {
  await sleep(5000); console.log('place: клик по карточке');
  await p.evaluate(() => { const c = document.querySelector('[data-buy]:not(.no)'); if (c) c.click(); });
  await sleep(600); console.log('place: касание карты');
  const vp = p.viewport(), x = vp.width * (+Deno.env.get('TAPX') || 0.42), y = vp.height * (+Deno.env.get('TAPY') || 0.45);
  if (dev === 'phone') await p.touchscreen.tap(x, y); else { await p.mouse.move(x - 40, y - 20); await p.mouse.move(x, y, { steps: 6 }); await p.mouse.click(x, y); }
  await sleep(900);
};
const OPEN = { tab3: async () => { await sleep(9000); }, tab6: async () => { await sleep(9000); }, def_plan: async () => { await sleep(5000); }, def_place: place, multi_plan: async (p) => { await p.evaluate(() => { const C = window.__a; C.setup.mrole = 'def'; C.setup.game = 'multi'; C.start('multi'); }); await sleep(7000); }, multi_place: async (p, dev) => { await OPEN.multi_plan(p); await place(p, dev); }, net_plan: async () => { await sleep(6000); }, net_place: place, mdef_plan: async () => { await sleep(6000); }, mdef_place: place };
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1700,1000', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
try {
  for (const dev of DEV === 'both' ? ['phone', 'pc'] : [DEV]) for (const s of SCR) {
    const p = await b.newPage(); await p.setViewport(dev === 'phone' ? PH : PC); const errs = [];
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160))); p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
    await p.evaluateOnNewDocument((acc, st, ph) => { localStorage.setItem('fortuna_airdef_acc', JSON.stringify(acc)); localStorage.setItem('fortuna_airdef_setup', JSON.stringify(st)); localStorage.setItem('fortuna_airdef_muted', '1');
      if (ph) { const set = () => document.documentElement.style.setProperty('--tg-t', '46px'); document.addEventListener('DOMContentLoaded', set); setInterval(set, 500); } }, ACC, { ...SETUP, mrole: 'def', side: s.startsWith('multi') ? 'east' : 'east' }, dev === 'phone');
    await p.goto(`${BASE}?${QUERY[s]}&gfx=high${LANG ? '&lang=' + LANG : ''}${dev === 'phone' ? '&touch=1&insets=0,47,21,47' : ''}`, { waitUntil: 'load', timeout: 120000 });
    await p.waitForFunction(() => window.__a && !document.getElementById('loading'), { timeout: 120000, polling: 500 }).catch(() => {}); await sleep(4000);
    await OPEN[s](p, dev); await sleep(1000);
    const dir = HERE; await p.screenshot({ path: `${dir}${TAG}_${s}_${dev}${LANG ? '_' + LANG : ''}.png` });
    console.log(s, dev, errs.slice(0, 3).join(' | ') || 'ок'); await p.close();
  }
} finally { await b.close(); }
