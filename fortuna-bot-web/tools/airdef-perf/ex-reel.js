// Ролик всех взрывов в игре (кадр рисует сама игра): по очереди каждый тип, кинокамера в ≈ 5,5 R от воронки (медленный облёт), с подписью.
//   deno run -A tools/airdef-perf/ex-reel.js [выход = ex-reel.mp4] [пресет = high] [секунд на тип = 12] [типы через запятую]
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [out = 'ex-reel.mp4', preset = 'high', secArg = '12', only] = Deno.args, FPS = 30, SEC = +secArg;
const CASES = [['light', 12, 'ground', 'Лёгкая БЧ — НАР, ПТУР'], ['medium', 32, 'bomb', 'Средняя — Mk 82, ОФАБ-250'], ['heavy', 47, 'bomb', 'Тяжёлая — ФАБ-500, Mk 84'],
  ['super', 74, 'bomb', 'Сверхтяжёлая — ФАБ-1500, GBU-57'], ['air', 14, 'air', 'Подрыв ЗУР в воздухе'], ['plane', 26, 'air', 'Сбитый самолёт'], ['burn', 20, 'burn', 'Пожар на объекте']];
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 900000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1280,720', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1.5 });
await page.evaluateOnNewDocument((p) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'air', diff: 'arcade', era: 3, side: 'east' })); localStorage.setItem('fortuna_airdef_gfx', p); }, preset);
await page.goto('http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?test=1&map=city&weather=day&go=air', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
for (let i = 0; i < 150; i++) { const l = await page.evaluate(() => { const e = document.getElementById('assetLoad'); return e && e.classList.contains('on'); }); if (!l && i > 6) break; await new Promise((r) => setTimeout(r, 1000)); }
await new Promise((r) => setTimeout(r, 4000));
await page.evaluate(() => { window.requestAnimationFrame = () => 0; const C = window.__a, ctrl = C.ctrl; ctrl.afterRender = () => {}; ctrl.extraCam = () => null; window.__t = performance.now();
  const f = new THREE.Vector3(); C.camera.getWorldDirection(f); f.y = 0; f.normalize(); window.__f = f; window.__o = C.camera.position.clone(); });
const root = Deno.makeTempDirSync(), parts = [];
let k = 0;
for (const [type, R, kind, label] of CASES) {
  if (only && !only.split(',').includes(type)) continue;
  await page.evaluate((R, kind, k) => {
    const C = window.__a, cam = C.camera, F = window.__f, S = new THREE.Vector3(-F.z, 0, F.x), d0 = 1800 + k * 1400;
    const x = window.__o.x + F.x * d0, z = window.__o.z + F.z * d0, gy = C.city.groundH(x, z), p = new THREE.Vector3(x, kind === 'air' ? gy + 700 : gy, z);
    window.__p = p; window.__T = 0;
    const r = Math.max(R, 20) * 5.5, h = kind === 'air' ? 0 : Math.max(R, 20) * 1.7, look = kind === 'air' ? 0 : Math.max(R, 20) * 1.0;
    C.ctrl.camera = () => { const a = 0.6 + window.__T * 0.035; cam.position.set(p.x + Math.cos(a) * r * S.x - Math.sin(a) * r * F.x, p.y + h, p.z + Math.cos(a) * r * S.z - Math.sin(a) * r * F.z); cam.lookAt(p.x, p.y + look, p.z); cam.updateMatrixWorld(); };
    C.__boom = () => { if (kind === 'burn') C.fx.burn(p, R); else { C.fx.explosion(p, R, kind); if (kind !== 'air') C.fx.crater(p, R, kind, gy, 0); } };
  }, R, kind, k++);
  const dir = `${root}/${type}`; Deno.mkdirSync(dir);
  for (let i = 0; i < SEC * FPS; i++) {
    const url = await page.evaluate((i, FPS) => { const C = window.__a; window.__T = i / FPS - 0.5; if (i === Math.round(0.5 * FPS)) C.__boom();
      for (let q = 0; q < 2; q++) { window.__t += 1000 / (2 * FPS); C.paused = false; window.__frame(window.__t); }
      return C.renderer.domElement.toDataURL('image/jpeg', 0.92); }, i, FPS);
    Deno.writeFileSync(`${dir}/${String(i).padStart(4, '0')}.jpg`, Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0)));
  }
  const seg = `${root}/${type}.mp4`, font = '/System/Library/Fonts/Supplemental/Arial.ttf';
  new Deno.Command('ffmpeg', { args: ['-v', 'error', '-y', '-framerate', String(FPS), '-i', `${dir}/%04d.jpg`, '-vf', `scale=1280:-2,drawtext=fontfile=${font}:text='${label}':x=28:y=24:fontsize=30:fontcolor=white:borderw=2:bordercolor=black@0.6`, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', seg] }).outputSync();
  parts.push(seg); console.log(type, 'готово');
}
Deno.writeTextFileSync(`${root}/list.txt`, parts.map((p) => `file '${p}'`).join('\n'));
new Deno.Command('ffmpeg', { args: ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', `${root}/list.txt`, '-c', 'copy', out] }).outputSync();
console.log(out, 'ошибки:', errs.length ? errs.slice(0, 3) : 'нет');
Deno.removeSync(root, { recursive: true }); await browser.close();
