// Чистый фон ангара для макетов панелей лобби (Mark 2026-11-17): телефон 844×390 ×3, без панели режима и кнопки старта; плюс кадры «как сейчас». Сервер 8935.
import puppeteer from 'npm:puppeteer-core@22.15.0';
const OUT = '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-mockups/lobby-panels/', BASE = 'http://127.0.0.1:8935/fortuna-bot-web/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=900,500'] });
try {
  for (const [name, setup] of [['multi', { game: 'multi', diff: 'arcade', era: 2, side: 'east', mrole: 'def' }], ['photo', { game: 'photo', diff: 'arcade', era: 2, side: 'west', pside: 'air' }]]) {
    const p = await b.newPage(); await p.setViewport({ width: 844, height: 390, deviceScaleFactor: 3, hasTouch: true, isMobile: true }); const errs = [];
    p.on('pageerror', (e) => errs.push('ERR ' + e.message));
    await p.evaluateOnNewDocument((st) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify(st)); localStorage.setItem('fortuna_airdef_muted', '1'); sessionStorage.setItem('fortuna_airdef_mpanel', '1'); }, setup);
    await p.goto(`${BASE}games/airdef.html?test=1&touch=1&insets=0,47,21,47&gfx=high&rmock=1`, { waitUntil: 'load', timeout: 120000 });
    await sleep(24000); await p.screenshot({ path: OUT + name + '_now.png' });
    await p.addStyleTag({ content: '.mpanel,#startBtn,#hgStrip{visibility:hidden!important}' }); await sleep(700); await p.screenshot({ path: OUT + 'bg_' + name + '.jpg', type: 'jpeg', quality: 90 });
    console.log(name, errs.slice(0, 3).join(' | ') || 'ошибок нет'); await p.close();
  }
} finally { await b.close(); }
