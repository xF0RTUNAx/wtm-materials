// Подбор упрощения домов (2026-10-27): для каждого варианта prepare.js собирает модель во временную папку стенда (_cmp, PREPARE_OUT /
// PREPARE_SIMP), house-compare.html сравнивает её с исходником без упрощения (6 видов, PSNR) и снимает лист «слева исходник, справа вариант».
//   deno run -A tools/airdef-models/house-compare.js h_log:none h_log:0.5:0.01:lock h_log:game …   (сервер игры — :8937)
// вариант: none — без упрощения (исходник), game — нынешний файл игры, доля:ошибка[:lock] — проба. Итог — таблица и снимки _cmp/<ключ>_<вариант>.png
import puppeteer from 'npm:puppeteer-core@22.15.0';
const HERE = new URL('./', import.meta.url).pathname, CMP = HERE + '_cmp/', GAME = new URL('../../games/airdef/models/', import.meta.url).pathname;
await Deno.mkdir(CMP, { recursive: true });
const sh = async (env, args) => { const o = await new Deno.Command('deno', { args: ['run', '-A', HERE + 'prepare.js', ...args], env, stdout: 'piped', stderr: 'piped' }).output(); return new TextDecoder().decode(o.stdout) + new TextDecoder().decode(o.stderr); };
const tag = (v) => v.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 60); // имя файла — без знаков адреса (?, |, скобки регулярного выражения)
const jobs = Deno.args.map((a) => { const [k, ...v] = a.split(':'); return { k, v: v.join(':') || 'none' }; });
for (const j of jobs) { // исходник без упрощения — один раз на ключ
  const src = `${CMP}${j.k}.glb`; try { Deno.statSync(src); } catch { const t = await Deno.makeTempDir(); await sh({ PREPARE_OUT: t, PREPARE_SIMP: 'none' }, [j.k]); Deno.renameSync(`${t}/${j.k}.glb`, src); }
  const out = `${CMP}${j.k}_${tag(j.v)}.glb`;
  if (j.v === 'game') Deno.copyFileSync(`${GAME}${j.k}.glb`, out);
  else if (j.v !== 'none') { const t = await Deno.makeTempDir(); const log = await sh({ PREPARE_OUT: t, PREPARE_SIMP: j.v }, [j.k]); Deno.renameSync(`${t}/${j.k}.glb`, out); j.log = (log.match(/упрощение: .*/) || [''])[0]; }
  else Deno.copyFileSync(src, out);
}
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage(); await page.setViewport({ width: 780, height: 1600, deviceScaleFactor: 1 });
  for (const j of jobs) {
    await page.goto(`http://127.0.0.1:8937/fortuna-bot-web/tools/airdef-models/house-compare.html?a=_cmp/${j.k}.glb&b=_cmp/${j.k}_${tag(j.v)}.glb`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__res, { timeout: 60000 });
    const r = await page.evaluate(() => window.__res);
    await page.screenshot({ path: `${CMP}${j.k}_${tag(j.v)}.png`, clip: { x: 0, y: 0, width: 768, height: 1584 } });
    console.log(`${j.k} ${j.v}: ${r.err || `${r.trisB} тр. (исходник ${r.trisA}) · PSNR ${r.psnr.join(' / ')} · мин ${Math.min(...r.psnr)}`} ${j.log || ''}`);
  }
} finally { await browser.close(); }
