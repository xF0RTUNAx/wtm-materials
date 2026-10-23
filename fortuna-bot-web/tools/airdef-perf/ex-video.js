// Видео взрыва в игре (как увидит игрок): кадр рисует сама игра (постобработка, небо, проходы дыма), камера игры подменена на время записи.
// Два плана: «кино» — 250 м от воронки, 80 м высоты, медленный облёт; «заход» — лётчик с 3,5 км и 1,2 км высоты летит на цель 230 м/с.
//   deno run -A tools/airdef-perf/ex-video.js [R = 47] [kind = bomb] [пресет = high] [флаги адреса, напр. &exnew=0] [выход = ex-video.mp4]
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [R = '47', kind = 'bomb', preset = 'high', flag = '', out = 'ex-video.mp4'] = Deno.args, FPS = 30;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1280,720', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1.5 });
await page.evaluateOnNewDocument((p) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'air', diff: 'arcade', era: 3, side: 'east' })); localStorage.setItem('fortuna_airdef_gfx', p); }, preset);
await page.goto(`http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?test=1&map=city&weather=day&go=air${flag}`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
for (let i = 0; i < 150; i++) { const l = await page.evaluate(() => { const e = document.getElementById('assetLoad'); return e && e.classList.contains('on'); }); if (!l && i > 6) break; await new Promise((r) => setTimeout(r, 1000)); }
await new Promise((r) => setTimeout(r, 4000));
const tmp = Deno.makeTempDirSync(); let n = 0;
const shot = async (plan, secs) => {
  await page.evaluate((R, kind, plan) => {
    window.requestAnimationFrame = () => 0; const C = window.__a, cam = C.camera, f = new THREE.Vector3(); cam.getWorldDirection(f); f.y = 0; f.normalize();
    const d0 = plan === 'kino' ? 1800 : 4200, x = cam.position.x + f.x * d0, z = cam.position.z + f.z * d0, gy = C.city.groundH(x, z);
    const p = new THREE.Vector3(x, gy, z); window.__p = p; window.__f = f.clone(); window.__plan = plan; window.__T = 0;
    if (!window.__t) window.__t = performance.now();
    // камера игры — наша на время записи (кадр рисует игра: постобработка, небо, дым)
    const ctrl = C.ctrl; if (!window.__camOrig) window.__camOrig = ctrl.camera;
    ctrl.camera = () => { const T = window.__T, q = window.__p, F = window.__f, S = new THREE.Vector3(-F.z, 0, F.x);
      if (window.__plan === 'kino') { const a = 0.6 + T * 0.035, r = 250; cam.position.set(q.x + Math.cos(a) * r * S.x - Math.sin(a) * r * F.x, q.y + 80, q.z + Math.cos(a) * r * S.z - Math.sin(a) * r * F.z); cam.lookAt(q.x, q.y + 45, q.z); }
      else { const dist = 3500 - 230 * T; cam.position.set(q.x - F.x * dist, q.y + 1200 - 40 * T, q.z - F.z * dist); cam.lookAt(q.x, q.y + 20, q.z); }
      cam.updateMatrixWorld(); };
    ctrl.afterRender = () => {}; ctrl.extraCam = () => null; // без окна прицельного контейнера
    C.__boom = () => { C.fx.explosion(p, +R, kind); if (kind !== 'air') C.fx.crater(p, +R, kind, gy, 0); };
  }, R, kind, plan);
  for (let i = 0; i < secs * FPS; i++) {
    const url = await page.evaluate((i, FPS) => { const C = window.__a; window.__T = i / FPS - 0.5; if (i === Math.round(0.5 * FPS)) C.__boom();
      for (let k = 0; k < 2; k++) { window.__t += 1000 / (2 * FPS); C.paused = false; window.__frame(window.__t); }
      return C.renderer.domElement.toDataURL('image/jpeg', 0.92); }, i, FPS);
    Deno.writeFileSync(`${tmp}/${String(n++).padStart(4, '0')}.jpg`, Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0)));
  }
};
await shot('kino', +(Deno.env.get('KINO') || 10)); await shot('zahod', 9);
new Deno.Command('ffmpeg', { args: ['-v', 'error', '-y', '-framerate', String(FPS), '-i', `${tmp}/%04d.jpg`, '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', out] }).outputSync();
console.log(out, 'кадров', n, 'ошибки:', errs.length ? errs.slice(0, 3) : 'нет');
Deno.removeSync(tmp, { recursive: true }); await browser.close();
