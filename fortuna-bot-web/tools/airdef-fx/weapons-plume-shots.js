// Снимки стенда tools/airdef-fx/weapons-plume.html (факел и дымный шлейф каждого ракетного оружия и ракет ЗРК) → tools/airdef-fx/shots/<метка>_NN.jpg
//   deno run -A tools/airdef-fx/weapons-plume-shots.js <метка> [only=s8,hydra,sam:s300] [t=0.3,1.5] [dots=0] [sky=dusk]
// Нужен сервер без кэша на :8937 (python3 tools/dev/nocache-server.py 8937; корень — wtm-materials), Google Chrome.
import puppeteer from 'npm:puppeteer-core@22.15.0';
const ROOT = new URL('./shots/', import.meta.url).pathname, tag = Deno.args[0] || 'shot';
const q = Deno.args.slice(1).join('&');
Deno.mkdirSync(ROOT, { recursive: true });
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=2000,1400'] });
const p = await b.newPage(); await p.setViewport({ width: 1900, height: 1300 });
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') console.log('  [страница]', m.text()); });
p.on('response', (x) => { if (x.status() >= 400) console.log('  [404]', x.url()); });
p.on('pageerror', (e) => console.log('  [ошибка]', e.message));
await p.goto(`http://localhost:8937/fortuna-bot-web/tools/airdef-fx/weapons-plume.html?${q}`, { waitUntil: 'load' });
await p.waitForFunction(() => window.__ready, { timeout: 120000, polling: 300 });
const n = await p.evaluate(() => window.sheets), names = await p.evaluate(() => window.names);
console.log(`листов: ${n}, оружия: ${names.length}`);
for (let i = 0; i < n; i++) {
  await p.evaluate((k) => window.renderSheet(k), i);
  const el = await p.$('#sheet'), f = `${ROOT}${tag}_${String(i + 1).padStart(2, '0')}.jpg`;
  await el.screenshot({ path: f, type: 'jpeg', quality: 84 });
  console.log(f, names.slice(i * 4, i * 4 + 4).join(', '));
}
if (Deno.env.get('LABELS')) console.log((await p.evaluate(() => window.__labels)).join('\n')); // числа по каждому оружию (модель, сопло)
await b.close();
