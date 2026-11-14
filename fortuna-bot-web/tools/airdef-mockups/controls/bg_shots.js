// Фоны для макетов управления: бой без кнопки газа и редактор кнопок без панели. Сервер 8935 (корень wtm-materials).
import puppeteer from 'npm:puppeteer-core@22.15.0';
const WEB = '/Users/mark./wtm-materials/fortuna-bot-web/', OUT = WEB + 'tools/airdef-mockups/controls/', BASE = 'http://127.0.0.1:8935/fortuna-bot-web/';
const { LOADOUTS } = await import('file://' + WEB + 'games/airdef/arsenal.js');
const lo = LOADOUTS[1].findIndex((L) => L.plane === 'e_f4');
const setup = { game: 'air', diff: 'arcade', era: 1, side: 'east', lo, pmap: 'city' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=900,500'] });
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
    await sleep(24000);
    const v = await p.evaluate(() => (document.querySelector('script[src*="main.js?v="]') || {}).src || '');
    const ver = (v.match(/v=([0-9a-z]+)/) || [])[1] || '20261114a';
    await p.evaluate(async (ver) => { const m = await import(`/fortuna-bot-web/games/airdef/layout.js?v=${ver}`); m.openLayoutEditor(() => {}); }, ver);
    await sleep(1500); await p.screenshot({ path: OUT + 'editor_now.png' });
    await p.addStyleTag({ content: '#ledBar{visibility:hidden!important}' }); await sleep(400); await p.screenshot({ path: OUT + 'bg_editor.jpg', type: 'jpeg', quality: 88 });
    console.log('редактор', ver, p.errs.slice(0, 5).join(' | ') || 'ошибок нет'); await p.close(); }
  if (which !== 'hangar') { const p = await open();
    await p.goto(`${BASE}games/airdef.html?go=air&test=1&touch=1&insets=0,47,21,47&gfx=high&rmock=1&weather=day&seed=7`, { waitUntil: 'load', timeout: 120000 });
    await p.waitForFunction(() => { const h = document.getElementById('wpn'); return h && h.offsetParent && /\d/.test(h.textContent); }, { timeout: 120000, polling: 250 }); await sleep(3500);
    await p.screenshot({ path: OUT + 'battle_now.png' });
    await p.addStyleTag({ content: '#wpn,#msg,#warn,#perf,#hint{visibility:hidden!important} #tThr{visibility:hidden!important}' }); await sleep(300);
    await p.screenshot({ path: OUT + 'bg_battle.jpg', type: 'jpeg', quality: 88 });
    const r = await p.evaluate(() => { const o = {}; for (const id of ['tThr', 'tFire', 'tLock', 'tBino', 'tFlare', 'tCam', 'tMap', 'tAuto']) { const e = document.getElementById(id); if (e && e.offsetParent) { const q = e.getBoundingClientRect(); o[id] = [q.left, q.top, q.width, q.height].map(Math.round); } } return o; });
    console.log('кнопки', JSON.stringify(r));
    console.log('бой', p.errs.slice(0, 5).join(' | ') || 'ошибок нет'); await p.close(); }
} finally { await b.close(); }
