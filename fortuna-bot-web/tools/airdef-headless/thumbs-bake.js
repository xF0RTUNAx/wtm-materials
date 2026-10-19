// Миниатюры единиц для карточек прокачки: tools/airdef-models/thumbs.html в Chrome без окна → games/airdef/thumbs/<ветка>_<ключ>.webp
//   deno run -A tools/airdef-headless/thumbs-bake.js [air:su30,pvo:s400]   (нужен сервер localhost:8935)
import puppeteer from 'npm:puppeteer-core@22.15.0';
const ROOT = new URL('../../', import.meta.url).pathname, OUT = ROOT + 'games/airdef/thumbs/';
Deno.mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 900 });
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') console.log('  [страница]', m.text()); });
p.on('pageerror', (e) => console.log('  [ошибка]', e.message));
await p.goto(`http://localhost:8935/fortuna-bot-web/tools/airdef-models/thumbs.html${Deno.args[0] ? '?ids=' + Deno.args[0] : ''}`, { waitUntil: 'load' });
await p.waitForFunction(() => window.__ok, { timeout: 600000, polling: 500 });
const th = await p.evaluate(() => window.__thumbs);
if (Deno.env.get('SHEET')) await p.screenshot({ path: Deno.env.get('SHEET'), fullPage: true }); // лист всех миниатюр — посмотреть разом
await b.close();
let n = 0;
for (const [id, url] of Object.entries(th)) {
  Deno.writeFileSync(OUT + id.replace(':', '_') + '.webp', Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0))); n++; // webp — прямо из Chrome
}
console.log(`миниатюр: ${n}`);
