// Снимки стенда tools/airdef-fx/jet-view.html (запечённое пламя реактивных двигателей) → tools/airdef-fx/shots/
//   deno run -A tools/airdef-fx/jet-shots.js e_su27,su30,f16            → shots/jet-<ключ>.png (5 кадров × день / сумерки × 4 вида)
//   deno run -A tools/airdef-fx/jet-shots.js all                        → shots/jet-all.jpg (все самолёты на форсаже, ¾ сзади, крупно у сопел)
//   deno run -A tools/airdef-fx/jet-shots.js cmp e_su27,f16             → shots/jet-compare.png («было / стало»: attachFlames и jetflame.js)
//   дальше можно добавить пары k=v для стенда: thr=1 ab=1 t=0.4 view=close sky=dusk cols=6 dots=0
// Сервер :8935 уже запущен (корень — wtm-materials; свой не поднимать), Google Chrome. Тяжело для Mac — на зарядке.
import puppeteer from 'npm:puppeteer-core@22.15.0';
const ROOT = new URL('./shots/', import.meta.url).pathname, PORT = Deno.env.get('PORT') || '8935';
const mode = Deno.args[0] === 'all' || Deno.args[0] === 'cmp' ? Deno.args[0] : 'states';
const keys = mode === 'states' ? (Deno.args[0] || 'e_su27').split(',') : mode === 'cmp' ? (Deno.args[1] || 'e_su27,f16') : '';
const q = Deno.args.slice(mode === 'states' ? 1 : mode === 'cmp' ? 2 : 1).filter((a) => a.includes('=')).join('&');
Deno.mkdirSync(ROOT, { recursive: true });
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=2600,1500'] });
const p = await b.newPage(); await p.setViewport({ width: 2500, height: 1400 });
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') console.log('  [страница]', m.text()); });
p.on('response', (x) => { if (x.status() >= 400) console.log('  [404]', x.url()); });
p.on('pageerror', (e) => console.log('  [ошибка]', e.message));
const qs = mode === 'all' ? 'all=1' : mode === 'cmp' ? `cmp=${keys}` : `p=${keys.join(',')}`;
await p.goto(`http://localhost:${PORT}/fortuna-bot-web/tools/airdef-fx/jet-view.html?${qs}${q ? '&' + q : ''}`, { waitUntil: 'load' });
await p.waitForFunction(() => window.__ready, { timeout: 120000, polling: 300 });
const n = await p.evaluate(() => window.sheets);
for (let i = 0; i < n; i++) {
  await p.evaluate((k) => window.renderSheet(k), i);
  const el = await p.$('#sheet'), f = mode === 'all' ? `${ROOT}jet-all.jpg` : mode === 'cmp' ? `${ROOT}jet-compare.png` : `${ROOT}jet-${keys[i]}.png`;
  await el.screenshot(mode === 'all' ? { path: f, type: 'jpeg', quality: 86 } : { path: f, type: 'png' });
  console.log(f);
}
console.log(((await p.evaluate(() => window.__labels)) || []).join('\n'));
await b.close();
