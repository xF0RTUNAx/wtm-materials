// Тот же headless-прогон, что run.sh, но под Deno — для Linux и облачных сессий (там нет JavaScriptCore из macOS).
//   deno run --allow-read --allow-net tools/drone-headless/run-deno.js [пресет] [режим] [погода] [god]
// Результаты (контрольные суммы боя) совпадают с run.sh: оба гоняют один и тот же run.js + harness.js.
const dir = new URL('.', import.meta.url).pathname;
Deno.chdir(dir);
const [gfx = 'medium', mode = 'arcade', weather = '', god = ''] = Deno.args;
if (!(await Deno.stat('three.min.js').catch(() => null))) {
  const r = await fetch('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
  await Deno.writeTextFile('three.min.js', await r.text());
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
