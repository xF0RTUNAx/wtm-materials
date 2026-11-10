// Кадры настоящей игры после внедрения: ангар (телефон, Safari с панелями, компьютер, настройки открыты) и бой. Сервер 8937.
import puppeteer from 'npm:puppeteer-core@22.15.0';
const WEB = '/Users/mark./wtm-materials/fortuna-bot-web/', OUT = new URL('./game/', import.meta.url).pathname, BASE = 'http://127.0.0.1:8937/fortuna-bot-web/';
const { LOADOUTS } = await import('file://' + WEB + 'games/airdef/arsenal.js');
const lo = LOADOUTS[1].findIndex((L) => L.plane === 'e_f4'), lo2 = LOADOUTS[2].findIndex((L) => L.plane === 'e_f4');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1700,1000', '--autoplay-policy=no-user-gesture-required'] });
async function open(vp, setup) { const p = await b.newPage(); await p.setViewport(vp); p.errs = [];
  p.on('pageerror', (e) => p.errs.push('ERR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) p.errs.push('CON ' + m.text().slice(0, 160)); });
  await p.evaluateOnNewDocument((st) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify(st)); localStorage.setItem('fortuna_airdef_muted', '1'); }, setup); return p; }
const PH = { width: 844, height: 390, deviceScaleFactor: 3, hasTouch: true, isMobile: true }, SF = { ...PH, height: 306 }, PC = { width: 1600, height: 900, deviceScaleFactor: 1 };
const S1 = { game: 'air', diff: 'arcade', era: 1, side: 'east', lo, pmap: 'city' }, S2 = { ...S1, era: 2, lo: lo2 };
const want = Deno.args.length ? Deno.args : ['hg', 'hg306', 'hgpc', 'hgset', 'hg2', 'hgen', 'bt', 'btpod', 'btpc'];
const SU = { ...S1, era: 4, side: 'west', lo: 0 }, F35 = { ...S1, era: 4, lo: 4 }, TY = { ...S1, era: 4, lo: 12 };
const HG = { hgsu: [PH, SU, 'touch=1&insets=0,47,21,47'], hgf35: [PH, F35, 'touch=1&insets=0,47,21,47'], hgsupc: [PC, SU, ''],  hg: [PH, S1, 'touch=1&insets=0,47,21,47'], hg306: [SF, S1, 'touch=1&insets=0,47,0,47'], hgpc: [PC, S1, ''], hg2: [PH, S2, 'touch=1&insets=0,47,21,47'], hgen: [PH, S2, 'touch=1&insets=0,47,21,47&lang=en'], hgset: [PH, S1, 'touch=1&insets=0,47,21,47'] };
const BT = { btsu: [PH, SU, 'touch=1&insets=0,47,21,47'], btty: [PH, TY, 'touch=1&insets=0,47,21,47'], btsupc: [PC, SU, ''],  bt: [PH, S1, 'touch=1&insets=0,47,21,47'], btpod: [PH, { ...S1, lo: lo + 1 }, 'touch=1&insets=0,47,21,47'], btpc: [PC, S2, ''] };
try {
  await Promise.all(want.filter((k) => HG[k]).map(async (k) => { const [vp, st, q] = HG[k], p = await open(vp, st);
    await p.goto(`${BASE}games/airdef.html?test=1&gfx=high&rmock=1${q ? '&' + q : ''}`, { waitUntil: 'load', timeout: 120000 }); await sleep(26000);
    if (k === 'hgset') { await p.evaluate(() => document.querySelector('.hgTop').click()); await sleep(500); }
    if (k === 'hgen') await sleep(300);
    await p.screenshot({ path: OUT + k + '.png' }); console.log(k, p.errs.slice(0, 4).join(' | ') || 'ошибок нет'); await p.close(); }));
  for (const k of want.filter((k) => BT[k])) { const [vp, st, q] = BT[k], p = await open(vp, st);
    await p.goto(`${BASE}games/airdef.html?go=air&test=1&gfx=high&rmock=1&weather=day&seed=7${q ? '&' + q : ''}`, { waitUntil: 'load', timeout: 120000 });
    await p.waitForFunction(() => { const h = document.getElementById('wpn'); return h && h.offsetParent && /\d/.test(h.textContent); }, { timeout: 120000, polling: 250 }); await sleep(3500);
    await p.screenshot({ path: OUT + k + '.png' }); console.log(k, p.errs.slice(0, 4).join(' | ') || 'ошибок нет'); await p.close(); }
} finally { await b.close(); }
