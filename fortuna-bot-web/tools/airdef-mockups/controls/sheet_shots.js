// Листы макетов по разделам (для Mark в чат). Сервер 8935.
import puppeteer from 'npm:puppeteer-core@22.15.0';
const OUT = '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-mockups/controls/shots/', URL0 = 'http://127.0.0.1:8935/fortuna-bot-web/tools/airdef-mockups/controls/index.html';
await Deno.mkdir(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const names = { 1: 'лист_1_крестовина', 2: 'лист_2_ступени_газа', 3: 'лист_3_газ_в_бою', 4: 'лист_4_редактор_кнопок' };
try {
  const p = await b.newPage(); await p.setViewport({ width: 1800, height: 1000, deviceScaleFactor: 1.5 }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  for (const s of [1, 2, 3, 4]) {
    await p.goto(`${URL0}?s=${s}`, { waitUntil: 'networkidle0' }); await sleep(900);
    const el = await p.$(`section[data-s="${s}"]`); await el.screenshot({ path: OUT + names[s] + '.png' });
  }
  console.log(errs.join(' | ') || 'ошибок нет');
} finally { await b.close(); }
