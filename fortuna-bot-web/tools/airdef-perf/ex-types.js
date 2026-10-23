// Взрывы всех типов в игре (fx/explode.json): каждый — с боковой камеры (≈ 11 R) и «как видит лётчик» (1,5 км высоты, 3 км в стороне),
// серия кадров по времени; пожар — столб дыма (burn). Пишет ex-types/<тип>.png (столбцы: сбоку | лётчик; строки — время).
//   deno run -A tools/airdef-perf/ex-types.js [пресет = high] [типы через запятую]
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [preset = 'high', only] = Deno.args;
const CASES = { light: [12, 'ground'], medium: [32, 'bomb'], heavy: [47, 'bomb'], super: [74, 'bomb'], air: [14, 'air'], plane: [26, 'air'], burn: [20, 'burn'] };
const TT = [0.1, 0.3, 0.7, 1.4, 2.5, 4, 8];
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 300000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=915,412', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
Deno.mkdirSync('ex-types', { recursive: true });
for (const [type, [R, kind]] of Object.entries(CASES)) {
  if (only && !only.split(',').includes(type)) continue;
  const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await page.setViewport({ width: 915, height: 412, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true });
  await page.evaluateOnNewDocument((p) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'air', diff: 'arcade', era: 3, side: 'east' })); localStorage.setItem('fortuna_airdef_gfx', p); }, preset);
  await page.goto('http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?test=1&touch=1&map=city&weather=day&go=air', { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
  for (let i = 0; i < 120; i++) { const l = await page.evaluate(() => { const e = document.getElementById('assetLoad'); return e && e.classList.contains('on'); }); if (!l && i > 6) break; await new Promise((r) => setTimeout(r, 1000)); }
  await new Promise((r) => setTimeout(r, 3000));
  await page.evaluate((R, kind) => {
    window.requestAnimationFrame = () => 0; const C = window.__a, cam = C.camera, f = new THREE.Vector3(); cam.getWorldDirection(f); f.y = 0; f.normalize();
    const x = cam.position.x + f.x * 1500, z = cam.position.z + f.z * 1500, gy = C.city.groundH(x, z), p = new THREE.Vector3(x, kind === 'air' ? gy + 900 : gy, z);
    window.__t = performance.now(); window.__t0 = 0;
    if (kind === 'burn') C.fx.burn(p, R); else C.fx.explosion(p, R, kind);
    const mk = (pos, look) => { const c = new THREE.PerspectiveCamera(50, C.renderer.domElement.width / C.renderer.domElement.height, 2, 40000); c.layers.enableAll(); c.position.copy(pos); c.lookAt(look); c.updateMatrixWorld(); return c; };
    const sd = Math.max(R, 20) * 11, up = kind === 'air' ? 0 : R * 1.3;
    window.__cams = [mk(new THREE.Vector3(p.x - f.z * sd, p.y + (kind === 'air' ? 0 : 0.35 * sd), p.z + f.x * sd), new THREE.Vector3(p.x, p.y + up, p.z)),
      mk(new THREE.Vector3(p.x - f.z * 3000, (kind === 'air' ? p.y : p.y + 1500), p.z + f.x * 3000), new THREE.Vector3(p.x, p.y + up, p.z))];
  }, R, kind);
  const shots = [];
  for (const tt of TT) {
    for (let k = 0; k < 2; k++) {
      await page.evaluate((tt, k) => { const C = window.__a; if (k === 0) { if (!window.__t0) window.__t0 = window.__t; while (window.__t < window.__t0 + tt * 1000) { window.__t += 1000 / 60; C.paused = false; window.__frame(window.__t); } }
        const Rr = C.renderer; Rr.setRenderTarget(null); Rr.render(C.scene, window.__cams[k]); }, tt, k);
      shots.push(await page.screenshot({ type: 'png', clip: { x: 915 / 2 - 240, y: 412 / 2 - 135, width: 480, height: 270 } }));
    }
  }
  const tmp = Deno.makeTempDirSync(); shots.forEach((b, i) => Deno.writeFileSync(`${tmp}/${String(i).padStart(2, '0')}.png`, b));
  const n = shots.length, inp = []; let fl = ''; for (let i = 0; i < n; i++) { inp.push('-i', `${tmp}/${String(i).padStart(2, '0')}.png`); fl += `[${i}]scale=480:270[s${i}];`; }
  for (let r = 0; r < TT.length; r++) fl += `[s${2 * r}][s${2 * r + 1}]hstack[r${r}];`;
  fl += TT.map((_, r) => `[r${r}]`).join('') + `vstack=${TT.length}`;
  new Deno.Command('ffmpeg', { args: ['-v', 'error', '-y', ...inp, '-filter_complex', fl, `ex-types/${type}.png`] }).outputSync();
  console.log(type, 'R', R, kind, 'ошибки:', errs.length ? errs.slice(0, 2) : 'нет');
  await page.close();
}
await browser.close();
