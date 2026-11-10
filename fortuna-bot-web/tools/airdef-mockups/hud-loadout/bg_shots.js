// Чистые фоны для макетов: ангар без панели подвесок и бой без левого блока и надписи. Сервер 8937.
import puppeteer from 'npm:puppeteer-core@22.15.0';
const WEB = '/Users/mark./wtm-materials/fortuna-bot-web/', OUT = WEB + 'tools/airdef-mockups/hud-loadout/', BASE = 'http://127.0.0.1:8937/fortuna-bot-web/';
const { LOADOUTS } = await import('file://' + WEB + 'games/airdef/arsenal.js');
const lo = LOADOUTS[1].findIndex((L) => L.plane === 'e_f4'); console.log('lo', lo, LOADOUTS[1][lo].name);
const setup = { game: 'air', diff: 'arcade', era: 1, side: 'east', lo, pmap: 'city' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=900,500', '--autoplay-policy=no-user-gesture-required'] });
async function open() {
  const p = await b.newPage(); await p.setViewport({ width: 844, height: 390, deviceScaleFactor: 3, hasTouch: true, isMobile: true }); p.errs = [];
  p.on('pageerror', (e) => p.errs.push('ERR ' + e.message));
  await p.evaluateOnNewDocument((st) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify(st)); localStorage.setItem('fortuna_airdef_muted', '1'); }, setup);
  return p;
}
const which = Deno.args[0] || 'both';
try {
  if (which !== 'battle') { const p = await open();
    await p.goto(`${BASE}games/airdef.html?test=1&touch=1&insets=0,47,21,47&gfx=high&rmock=1`, { waitUntil: 'load', timeout: 120000 });
    await sleep(26000); await p.screenshot({ path: OUT + 'hangar_now.png' });
    await p.addStyleTag({ content: '.mpanel{visibility:hidden!important}' }); await sleep(600); await p.screenshot({ path: OUT + 'bg_hangar.jpg' });
    console.log('ангар', p.errs.slice(0, 5).join(' | ') || 'ошибок нет'); await p.close(); }
  if (which !== 'hangar') { const p = await open();
    await p.goto(`${BASE}games/airdef.html?go=air&test=1&touch=1&insets=0,47,21,47&gfx=high&rmock=1&weather=day&seed=7`, { waitUntil: 'load', timeout: 120000 });
    await p.waitForFunction(() => { const h = document.getElementById('wpn'); return h && h.offsetParent && /\d/.test(h.textContent); }, { timeout: 120000, polling: 250 }); await sleep(3500); await p.screenshot({ path: OUT + 'battle_now.png' });
    await p.addStyleTag({ content: '#wpn,#msg,#warn,#perf{visibility:hidden!important}' }); await sleep(300); await p.screenshot({ path: OUT + 'bg_battle.jpg' });
    console.log('бой', p.errs.slice(0, 5).join(' | ') || 'ошибок нет'); await p.close(); }
} finally { await b.close(); }
