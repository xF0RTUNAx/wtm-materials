// Снимки стенда tools/airdef-fx/cm-view.html (залп ЛТЦ и диполей у самолёта и вертолёта) → tools/airdef-fx/shots/cm-<ключ>.png
//   deno run -A tools/airdef-fx/cm-shots.js e_su25,f16,e_b52 [t=0.3,1.5] [v=200] [dots=0] [lo=1]
// Нужен сервер без кэша на :8937 (python3 fortuna-bot-web/tools/dev/nocache-server.py 8937; корень — wtm-materials), Google Chrome.
import puppeteer from 'npm:puppeteer-core@22.15.0';
const ROOT = new URL('./shots/', import.meta.url).pathname, keys = (Deno.args[0] || 'e_su25').split(',');
const q = Deno.args.slice(1).join('&'), PORT = Deno.env.get('PORT') || '8937';
Deno.mkdirSync(ROOT, { recursive: true });
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=2000,900'] });
const p = await b.newPage(); await p.setViewport({ width: 1900, height: 800 });
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') console.log('  [страница]', m.text()); });
p.on('response', (x) => { if (x.status() >= 400) console.log('  [404]', x.url()); });
p.on('pageerror', (e) => console.log('  [ошибка]', e.message));
await p.goto(`http://localhost:${PORT}/fortuna-bot-web/tools/airdef-fx/cm-view.html?p=${keys.join(',')}${q ? '&' + q : ''}`, { waitUntil: 'load' });
await p.waitForFunction(() => window.__ready, { timeout: 120000, polling: 300 });
for (let i = 0; i < keys.length; i++) {
  await p.evaluate((k) => window.renderSheet(k), i);
  const el = await p.$('#sheet'), f = `${ROOT}cm-${keys[i]}.png`;
  await el.screenshot({ path: f, type: 'png' });
  console.log(f);
}
console.log((await p.evaluate(() => window.__labels)).join('\n'));
await b.close();
