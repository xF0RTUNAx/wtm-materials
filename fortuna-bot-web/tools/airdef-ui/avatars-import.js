// Аватарки сборщика → игра (Mark 2026-11-04). Номер в игре = номер на листе, по которому выбирал Mark: порядковый номер файла ava_XX.webp в папке
// сборщика (ava_18 и ava_23 Mark исключил, поэтому после №18 номер на листе и номер в имени файла расходятся).
// Берёт аватарку по умолчанию и аватарки магазина из arsenal.js: aNN.webp (256) — как у сборщика, aNN_l.webp (512) — большая в магазине; лишние файлы удаляет.
//   deno run -A tools/airdef-ui/avatars-import.js
import { AVA_DEFAULT, AVA_SHOP } from '../../games/airdef/arsenal.js';
const HOME = Deno.env.get('HOME'), ROOT = new URL('../../games/airdef/', import.meta.url).pathname;
const SRC = `${HOME}/Downloads/Воздушное превосходство/Иконки/Аватарки`, OUT = `${ROOT}ui/avatars`;
const files = [...Deno.readDirSync(SRC)].map((e) => e.name).filter((n) => /^ava_\d+\.webp$/.test(n)).sort();
if (files.length !== 29) throw new Error(`ожидалось 29 аватарок, в папке ${files.length}`);
const file = (id) => files[parseInt(id.slice(1), 10) - 1].replace('.webp', '');
Deno.mkdirSync(OUT, { recursive: true });
const want = new Set();
for (const id of [AVA_DEFAULT, ...AVA_SHOP]) {
  Deno.copyFileSync(`${SRC}/${file(id)}.webp`, `${OUT}/${id}.webp`); want.add(`${id}.webp`);
  console.log(id, '←', file(id));
  if (id === AVA_DEFAULT) continue; // по умолчанию — только маленькая: в магазине её нет
  const r = new Deno.Command('cwebp', { args: ['-quiet', '-q', '84', '-m', '6', '-resize', '512', '512', `${SRC}/${file(id)}.png`, '-o', `${OUT}/${id}_l.webp`] }).outputSync();
  if (!r.success) throw new Error(`cwebp ${id}: ${new TextDecoder().decode(r.stderr)}`);
  want.add(`${id}_l.webp`);
}
for (const e of Deno.readDirSync(OUT)) if (!want.has(e.name)) Deno.removeSync(`${OUT}/${e.name}`);
Deno.copyFileSync(`${HOME}/Downloads/Воздушное превосходство/Фон магазина аватарок/bg_avatars.jpg`, `${ROOT}shop/bg_avatars.jpg`);
console.log('готово:', want.size, 'файлов в ui/avatars и фон shop/bg_avatars.jpg');
