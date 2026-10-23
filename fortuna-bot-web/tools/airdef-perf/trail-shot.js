// Дымы повреждений в игре: виртуальный подбитый самолёт пролетает в 260 м перед камерой (200 м/с, плавный вираж) и тянет 4 следа рядом — серый,
// чёрный, огонь с чёрным дымом, течь бака (C.fx.zoneTrail каждые 5 м, как plane-damage.js). Прежние пятна (?puff=0) против клубов из Blender.
//   deno run -A tools/airdef-perf/trail-shot.js [папка = .] [пресет = high] [видео: 1 — ещё и ролик]
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [out = '.', preset = 'high', vid = '0'] = Deno.args;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1280,720', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const shoot = async (flag, tag) => {
  const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1.5 });
  await page.evaluateOnNewDocument((p) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'air', diff: 'arcade', era: 3, side: 'east' })); localStorage.setItem('fortuna_airdef_gfx', p); }, preset);
  await page.goto(`http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?test=1&map=city&weather=day&go=air${flag}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
  for (let i = 0; i < 150; i++) { const l = await page.evaluate(() => { const e = document.getElementById('assetLoad'); return e && e.classList.contains('on'); }); if (!l && i > 6) break; await new Promise((r) => setTimeout(r, 1000)); }
  await new Promise((r) => setTimeout(r, 4000));
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; const C = window.__a, ctrl = C.ctrl; ctrl.afterRender = () => {}; ctrl.extraCam = () => null; window.__t = performance.now();
    const cam = C.camera, f = new THREE.Vector3(); cam.getWorldDirection(f); f.y = 0; f.normalize(); const s = new THREE.Vector3(-f.z, 0, f.x), o = cam.position.clone();
    const c0 = o.clone().addScaledVector(f, 260); c0.y = C.city.groundH(c0.x, c0.z) + 600; o.y = c0.y + 30; // под облаками (низ — от 2300 м): 600 м над землёй, 260 м перед камерой
    window.__trail = { f, s, c0, x: -600, acc: 0 };
    C.ctrl.camera = () => { cam.position.copy(o).addScaledVector(s, 60).add(new THREE.Vector3(0, 10, 0)); cam.lookAt(c0); cam.updateMatrixWorld(); };
    window.__step = (dt) => { const T = window.__trail, W = { x: 3, y: 0, z: 1 }; T.x += 200 * dt; T.acc += 200 * dt;
      const v = T.s.clone().multiplyScalar(200).add(new THREE.Vector3(0, -20, 0));
      while (T.acc >= 5) { T.acc -= 5; const x = T.x - T.acc;
        for (let k = 0; k < 4; k++) { const p = T.c0.clone().addScaledVector(T.s, x).add(new THREE.Vector3(0, 45 - k * 30 - x * 0.06 + 0.00012 * x * x, 0)).addScaledVector(T.f, k * 20); C.fx.zoneTrail(p, v, W, k, 0.8); } } }; });
  const FPS = 30, N = 9 * FPS, shots = [], dir = Deno.makeTempDirSync();
  for (let i = 0; i < N; i++) {
    const url = await page.evaluate((FPS) => { const C = window.__a; for (let q = 0; q < 2; q++) { window.__t += 1000 / (2 * FPS); if (window.__trail.x < 600) window.__step(1 / (2 * FPS)); C.paused = false; window.__frame(window.__t); }
      return C.renderer.domElement.toDataURL('image/jpeg', 0.9); }, FPS);
    const b = Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0)); Deno.writeFileSync(`${dir}/${String(i).padStart(4, '0')}.jpg`, b);
    if (i === 4 * FPS || i === 8 * FPS) shots.push(b);
  }
  shots.forEach((b, k) => Deno.writeFileSync(`${out}/trail-${tag}-${k}.jpg`, b));
  if (vid === '1') new Deno.Command('ffmpeg', { args: ['-v', 'error', '-y', '-framerate', String(FPS), '-i', `${dir}/%04d.jpg`, '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', `${out}/trail-${tag}.mp4`] }).outputSync();
  Deno.removeSync(dir, { recursive: true }); await page.close(); return errs;
};
const e0 = await shoot('&puff=0', 'old'), e1 = await shoot('', 'new');
console.log('ошибки:', [...e0, ...e1].slice(0, 3).join(' | ') || 'нет');
await browser.close();
