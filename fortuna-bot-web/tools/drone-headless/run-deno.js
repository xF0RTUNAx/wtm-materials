// Тот же headless-прогон, что run.sh, но под Deno — для Linux и облачных сессий (там нет JavaScriptCore из macOS).
//   deno run --allow-read --allow-write --allow-net --allow-env tools/drone-headless/run-deno.js [пресет] [режим] [погода] [god]
// Результаты (контрольные суммы боя) совпадают с run.sh: оба гоняют один и тот же run.js + harness.js.
const dir = new URL('.', import.meta.url).pathname;
Deno.chdir(dir);
const [gfx = 'medium', mode = 'arcade', weather = '', god = ''] = Deno.args;
if (!(await Deno.stat('three.min.js').catch(() => null))) {
  await Deno.writeTextFile('three.min.js', await fetchThree());
}
// three.min.js r128: cdnjs (как в игре), а если он закрыт (облачная сессия пускает только реестр npm) — тот же файл из пакета three@0.128.0
async function fetchThree() {
  try {
    const r = await fetch('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
    if (r.ok) return await r.text();
  } catch (_) { /* пробуем npm */ }
  const r = await fetch('https://registry.npmjs.org/three/-/three-0.128.0.tgz');
  if (!r.ok) throw new Error('three.min.js: ни cdnjs, ни npm недоступны');
  const tar = new Uint8Array(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  const dec = new TextDecoder();
  for (let o = 0; o + 512 <= tar.length;) { // tar: заголовок 512 байт (имя 0–99, размер 124–135 восьмеричный), данные кратны 512
    const name = dec.decode(tar.subarray(o, o + 100)).replace(/\0.*$/s, '');
    if (!name) break;
    const size = parseInt(dec.decode(tar.subarray(o + 124, o + 136)).replace(/\0.*$/s, '').trim(), 8) || 0;
    if (name === 'package/build/three.min.js') return dec.decode(tar.subarray(o + 512, o + 512 + size));
    o += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error('three.min.js не найден в пакете three@0.128.0');
}
// глобальные объекты Deno, которые подменяет harness.js (в JavaScriptCore их нет) — делаем обычными записываемыми свойствами
for (const k of ['window', 'navigator', 'location', 'localStorage', 'performance', 'document', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'addEventListener', 'removeEventListener', 'screen', 'history', 'matchMedia', 'innerWidth', 'innerHeight', 'devicePixelRatio', 'parent', 'self']) {
  try { Object.defineProperty(globalThis, k, { value: globalThis[k], writable: true, configurable: true }); } catch (_) { /* уже обычное */ }
}
// Web Worker в JavaScriptCore нет — игра строит рельеф в основном потоке; в Deno поток держал бы процесс живым после прогона
Object.defineProperty(globalThis, 'Worker', { value: undefined, writable: true, configurable: true });
const decoder = new TextDecoder();
Object.assign(globalThis, {
  print: (...a) => console.log(...a),
  readFile: (p) => decoder.decode(Deno.readFileSync(p)),
  load: (p) => (0, eval)(decoder.decode(Deno.readFileSync(p))),
  THREE_PATH: 'three.min.js', MAIN_PATH: new URL(`../../games/drone/${Deno.env.get('DRONE_MAIN') || 'main'}.js`, import.meta.url).href,
  GFX_ARG: gfx, MODE_ARG: mode, WEATHER_ARG: weather, GOD_ARG: god,
});
load('run.js');
