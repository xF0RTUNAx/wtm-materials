// Сборка сайта игры airsuperiorityonline.com (Mark 2026-11-19: «выкладывай сайт игры»): лендинг tools/airdef-mockups/site2/v4 + документы
// games/legal → одна папка без «../» (корень сайта = страница v4). Выкладка - Cloudflare Workers со статическими файлами (tools/airdef-site/wrangler.toml,
// Worker airsuperiorityonline, свой домен airsuperiorityonline.com и www, workers.dev выключен):
//   deno run -A tools/airdef-site/build.js tools/airdef-site/dist && cd tools/airdef-site && npx --yes wrangler@4 deploy
// Игра остаётся на fortunawtm.com/fortuna-bot-web/games/airdef.html (кнопки «Играть» ведут туда); документы - и в игре (games/legal), и здесь (/legal/).
const WEB = new URL('../../', import.meta.url).pathname, SRC = WEB + 'tools/airdef-mockups/site2/', OUT = Deno.args[0];
if (!OUT) { console.log('укажите папку: deno run -A tools/airdef-site/build.js <папка>'); Deno.exit(2); }
try { Deno.removeSync(OUT, { recursive: true }); } catch (_) { /* не было */ }
const mk = (d) => Deno.mkdirSync(d, { recursive: true });
function copyDir(from, to, skip = () => false) {
  mk(to);
  for (const e of Deno.readDirSync(from)) {
    if (skip(e.name)) continue;
    if (e.isDirectory) copyDir(`${from}/${e.name}`, `${to}/${e.name}`, skip); else Deno.copyFileSync(`${from}/${e.name}`, `${to}/${e.name}`);
  }
}
const rw = (from, to, pairs) => {
  let s = Deno.readTextFileSync(from);
  for (const [a, b] of pairs) { if (!s.includes(a)) throw new Error(`${from}: нет «${a}»`); s = s.split(a).join(b); }
  Deno.writeTextFileSync(to, s);
};
mk(OUT);
// лендинг
const P = [['../../../../games/legal/', 'legal/'], ['../../../../img/', 'img/']];
rw(SRC + 'v4/index.html', OUT + '/index.html', [...P, ['../img/', 'img/'], ['../video/', 'video/']]);
rw(SRC + 'v4/site.css', OUT + '/site.css', [['../fonts/', 'fonts/'], ['../img/', 'img/']]);
rw(SRC + 'v4/site.js', OUT + '/site.js', [['../img/', 'img/'], ['../video/', 'video/']]);
rw(SRC + 'v4/fly3d.js', OUT + '/fly3d.js', [["new URL('../models/', import.meta.url)", "new URL('./models/', import.meta.url)"]]);
Deno.copyFileSync(SRC + 'v4/i18n.js', OUT + '/i18n.js');
Deno.copyFileSync(SRC + 'v4/fly.js', OUT + '/fly.js');
copyDir(SRC + 'img', OUT + '/img');
copyDir(SRC + 'models', OUT + '/models');
copyDir(SRC + 'video', OUT + '/video');
copyDir(SRC + 'fonts', OUT + '/fonts');
for (const f of ['airdef-logo-alpha.webp', 'airdef-logo-dark.webp']) Deno.copyFileSync(WEB + 'img/' + f, OUT + '/img/' + f);
// документы: логотип ведёт на главную сайта, шрифты - общие
mk(OUT + '/legal');
for (const f of ['privacy.html', 'terms.html', 'account-deletion.html', 'support.html']) rw(WEB + 'games/legal/' + f, OUT + '/legal/' + f, [['../../img/', '../img/']]);
rw(WEB + 'games/legal/legal.css', OUT + '/legal/legal.css', [['../../img/', '../img/'], ['../airdef/fonts/', '../fonts/']]);
rw(WEB + 'games/legal/legal.js', OUT + '/legal/legal.js', [['href="../airdef.html"', 'href="../"']]);
for (const f of ['oswald-cyrillic.woff2', 'oswald-latin.woff2']) Deno.copyFileSync(WEB + 'games/airdef/fonts/' + f, OUT + '/fonts/' + f);
// проверка: в собранном не осталось ссылок «../» наружу корня (кроме документов, у которых корень - на уровень выше)
let bad = 0;
for (const f of ['index.html', 'site.css', 'site.js', 'fly.js', 'fly3d.js']) { const s = Deno.readTextFileSync(`${OUT}/${f}`); if (/["'(]\.\.\//.test(s)) { console.log('  осталась ссылка ../ в', f); bad++; } }
let n = 0, bytes = 0; const walk = (d) => { for (const e of Deno.readDirSync(d)) { const p = `${d}/${e.name}`; if (e.isDirectory) walk(p); else { n++; bytes += Deno.statSync(p).size; } } }; walk(OUT);
console.log(`сайт собран: ${OUT} - файлов ${n}, ${(bytes / 1048576).toFixed(1)} МБ${bad ? `, ПРОБЛЕМ: ${bad}` : ''}`);
Deno.exit(bad ? 1 : 0);
