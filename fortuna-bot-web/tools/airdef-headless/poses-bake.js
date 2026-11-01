// Ракурсы единиц для заставок: tools/airdef-models/poses.html в Chrome без окна → <папка>/<имя>.webp
//   deno run -A tools/airdef-headless/poses-bake.js <папка> "имя~id~az~el~крен~тангаж~рыск~fov;…" [порт, по умолчанию 8935]
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [OUT, SPEC, PORT = '8935'] = Deno.args;
Deno.mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 900 });
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') console.log('  [страница]', m.text()); });
p.on('pageerror', (e) => console.log('  [ошибка]', e.message));
await p.goto(`http://localhost:${PORT}/fortuna-bot-web/tools/airdef-models/poses.html?s=${encodeURIComponent(SPEC)}`, { waitUntil: 'load' });
await p.waitForFunction(() => window.__ok, { timeout: 600000, polling: 500 });
const th = await p.evaluate(() => window.__thumbs), names = await p.evaluate(() => window.__names);
await b.close();
for (const [name, url] of Object.entries(th)) Deno.writeFileSync(`${OUT}/${name}.webp`, Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0)));
Deno.writeTextFileSync(`${OUT}/names.json`, JSON.stringify(names, null, 1));
console.log(`ракурсов: ${Object.keys(th).length}`);
