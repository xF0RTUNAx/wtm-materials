// Снимки деревьев ревизии 2 → games/airdef/tex/tr_<набор>2_a / _n (.ktx2, _lo, запасные webp). Нужен сервер :8935 (корень wtm-materials):
//   deno run -A tools/airdef-trees/bake2.js c w a      (c - город, w - зима, a - осень). Печатает виды [радиус, центр, высота] для TREE_IMP (city-render.js)
import puppeteer from 'npm:puppeteer-core@22.15.0';
const SETS = { c: ['city2', 'trees_c', ['tr_oak', 'tr_lime', 'tr_pine', 'tr_bush', 'tr_birch', 'tr_maple', 'tr_poplar', 'tr_spruce']], w: ['winter2', 'trees_w', ['w_fir1', 'w_fir3', 'w_pine1', 'w_pine2', 'w_birch', 'w_oak', 'w_fir_b']], a: ['autumn2', 'trees_a', ['a_oak', 'a_lime', 'tr_pine', 'a_maple', 'a_birch', 'a_oak_h', 'pr_deadtree']] };
const T = new URL('../../games/airdef/tex/', import.meta.url).pathname, run = (c, a) => { const o = new Deno.Command(c, { args: a, stdout: 'null', stderr: 'piped' }).outputSync(); if (!o.success) throw new Error(c + new TextDecoder().decode(o.stderr).slice(-300)); };
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const k of Deno.args) { const [set, pack, L] = SETS[k], p = await b.newPage(); p.on('pageerror', (e) => console.log('ERR', e.message)); p.on('console', (m) => { if (m.type() === 'error') console.log(m.text().slice(0, 200)); });
  await p.goto(`http://localhost:8935/fortuna-bot-web/tools/airdef-trees/bake.html?pack=/fortuna-bot-web/games/airdef/models/${pack}.glb&trees=${L.join(',')}&g=6&c=256&cols=4`); await p.waitForFunction('window.__ok || window.__err', { timeout: 120000 });
  const er = await p.evaluate('window.__err'); if (er) throw new Error(er);
  const info = await p.evaluate('window.__info'), o = await p.evaluate('window.__bake()'), tmp = Deno.makeTempDirSync();
  for (const q of ['a', 'n']) { const f0 = `${tmp}/${q}0.png`, f = `${tmp}/${q}.png`; Deno.writeFileSync(f0, Uint8Array.from(atob(o[q].split(',')[1]), (c) => c.charCodeAt(0)));
    run('ffmpeg', ['-v', 'error', '-y', '-i', f0, '-vf', 'scale=iw/2:ih/2:flags=area', f]); // снято вдвое крупнее: мелкая листва - долями покрытия, а не дырами
    for (const lo of [0, 1]) { const n = `tr_${set}_${q}${lo ? '_lo' : ''}`; let g = f; if (lo) { g = `${tmp}/${q}lo.png`; run('ffmpeg', ['-v', 'error', '-y', '-i', f, '-vf', 'scale=iw/2:ih/2:flags=area', g]); }
      run('cwebp', ['-quiet', '-q', '88', '-alpha_q', '100', '-exact', g, '-o', `${T}${n}.webp`]);
      run('basisu', q === 'a' ? ['-ktx2', '-mipmap', '-q', '220', '-comp_level', '2', g, '-output_file', `${T}${n}.ktx2`] : ['-ktx2', '-uastc', '-uastc_level', '2', '-uastc_rdo_l', '1.5', '-ktx2_zstandard_level', '18', '-mipmap', '-linear', g, '-output_file', `${T}${n}.ktx2`]); } }
  Deno.copyFileSync(`${tmp}/a.png`, `/tmp/tr_${set}_a.png`); console.log(set, JSON.stringify(info.trees.map((t) => [t.name, t.R, t.cyO, t.H, t.crown]))); await p.close(); }
await b.close();
