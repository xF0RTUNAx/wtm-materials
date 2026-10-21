// Снимки интерфейса на выбранном языке (меню — все режимы и вкладки, «Исследования», событие, пауза): ПК 1280×720 и телефон 844×390.
//   deno run -A tools/i18n/ui-shots.js [lang=en] [pc|phone]   (нужен сервер localhost:8935) → tools/i18n/shots/ui-<устройство>-<кадр>.png
import puppeteer from 'npm:puppeteer-core@22.15.0';
const LANG = Deno.args.find((a) => /^(en|ru)$/.test(a)) || 'en', DEV = Deno.args.find((a) => /^(pc|phone)$/.test(a)) || 'pc';
const OUT = new URL('./shots/', import.meta.url).pathname, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage();
const phone = DEV === 'phone';
await p.setViewport(phone ? { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { width: 1280, height: 720 });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`http://localhost:8935/fortuna-bot-web/games/airdef.html?lang=${LANG}&gfx=low&test=1${phone ? '&touch=1' : ''}`, { waitUntil: 'load' });
await p.waitForFunction(() => !document.getElementById('loading') && document.getElementById('menu') && document.getElementById('menu').classList.contains('on'), { timeout: 240000, polling: 500 });
await sleep(1500);
const shot = async (name) => { await sleep(500); await p.screenshot({ path: `${OUT}ui-${DEV}-${name}.png` }); console.log('снимок', name); };
const click = async (sel) => { await p.evaluate((s) => document.querySelector(s).click(), sel); await sleep(400); };
const tab = async (t) => { await click(`#mtabs button[data-tab="${t}"]`); };
// режимы меню
for (const g of ['air', 'defense', 'multi', 'training', 'photo']) {
  await click(`#modeSel button[data-g="${g}"]`); await sleep(700);
  if (g === 'training') { await shot('menu-training-first'); await click('[data-fs="list"]'); }
  await shot('menu-' + g);
  if (g === 'air') await p.evaluate(() => { const el = document.querySelector('#tab-play'); if (el) el.scrollTop = 99999; }).then(() => shot('menu-air-bottom'));
}
await click('#modeSel button[data-g="online"]'); await sleep(900); await shot('menu-online');
await click('#modeSel button[data-g="air"]');
for (const t of ['set', 'ref', 'misc', 'guide']) { await tab(t); await sleep(600); await shot('tab-' + t); await p.evaluate(() => { const s = document.querySelector('.msbody, #msheet .msbody, #msheet'); if (s) s.scrollTop = 99999; }); if (t === 'set') await shot('tab-set-bottom'); await tab(t); }
// исследования
await click('#resBtn'); await sleep(1200); await shot('research'); await p.evaluate(() => { const c = document.querySelector('#research .card'); if (c) c.click(); }); await sleep(500); await shot('research-card');
await click('#research [data-close-all]'); await sleep(400);
// событие
await click('#evtBtn'); await sleep(1000); await shot('event'); await click('#event [data-tab="def"]'); await shot('event-defense'); await click('#event [data-close]'); await sleep(300);
// бой и пауза
await click('#startBtn'); await sleep(7000); await shot('battle'); await click('#pause'); await sleep(500); await shot('pause');
await click('#pauseEnd'); await sleep(2500); await shot('end');
// «Съёмка»: интерфейс и подписи объекта; подсказки клавиш (ПК); редактор кнопок (телефон)
await click('#closeBtn'); await sleep(1500);
await click('#modeSel button[data-g="photo"]'); await sleep(6000); // режим «Съёмка» может перезагрузить страницу (карта)
await p.waitForFunction(() => !document.getElementById('loading') && document.getElementById('menu').classList.contains('on'), { timeout: 240000, polling: 500 });
await click('#startBtn'); await sleep(9000); await shot('photo');
await click('#phSide [data-ph="hide"]'); await sleep(300); await click('#phSide [data-ph="hide"]');
await p.keyboard.press('Escape'); await sleep(800); await click('#pauseExit'); await sleep(2000);
if (!phone) {
  await click('#modeSel button[data-g="air"]');
  await click('#startBtn'); await sleep(6000); await p.keyboard.press('F1'); /* F1 — включить подсказки клавиш */ await sleep(900); await shot('hints'); await click('#pause'); await click('#pauseExit'); await sleep(1500);
} else {
  await tab('set'); await click('#sLayout'); await sleep(800); await shot('layout'); await click('#ledDone'); await sleep(500);
}
console.log('ошибки страницы:', errs.length ? errs.join(' | ') : 'нет');
await b.close();
