// Наведение и пуск зенитного комплекса в игре (кадр рисует сама игра): цель — самолёт игрока, его держим на дальности и высоте (уходит хвостом —
// ИК-ГСН видит), комплекс разворачивает башню и поднимает пакет, пускает ракету. Камера: 3/4 сбоку от машины (наведение), с пуска — чуть дальше.
// Печатает ход наведения (азимут, угол места пусковой) и пуска (высота, скорость, двигатель), пишет кадры, лист кадров и ролик <папка>/<ключ>.mp4.
//   [SIDE=west] [CAM=front] deno run -A tools/airdef-perf/sam-launch.js [папка = .] [ключ = strela1] [эпоха = 1] [пресет = high] [секунд после пуска = 3] [карта = autumn] [дальность, м = 3000] [высота, м = 900]
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [out = '.', key = 'strela1', era = '1', preset = 'high', secArg = '3', map = 'autumn', distArg = '3000', hArg = '900'] = Deno.args, FPS = 30, SEC = +secArg;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 900000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1280,720', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
try {
  const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 300)); });
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1.5 });
  await page.evaluateOnNewDocument((p, era, side) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'air', diff: 'arcade', era: +era, side })); localStorage.setItem('fortuna_airdef_gfx', p); }, preset, era, Deno.env.get('SIDE') || 'east'); // SIDE=west — западные комплексы (NASAMS, Patriot)
  await page.goto(`http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?test=1&map=${map}&weather=day&go=air`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
  for (let i = 0; i < 150; i++) { const l = await page.evaluate(() => { const e = document.getElementById('assetLoad'); return e && e.classList.contains('on'); }); if (!l && i > 6) break; await new Promise((r) => setTimeout(r, 1000)); }
  const found = await page.evaluate((key, FRONT) => {
    const C = window.__a, u = C.S.units.find((q) => q.key === key && !q.dead); if (!u) return null;
    window.requestAnimationFrame = () => 0; C.ctrl.afterRender = () => {}; C.ctrl.extraCam = () => null; window.__t = performance.now();
    window.__u = u; window.__cam = { mode: 'aim' }; window.__front = FRONT;
    if (['nasams', 'patriot', 'pac3'].includes(key)) window.__lel0 = u.lel; // постоянный угол блока (launchers.js el, режим box) — бой его не меняет, исходный и оставляем
    const R = new THREE.Vector3(Math.cos(u.yaw), 0, -Math.sin(u.yaw)), F = new THREE.Vector3(-Math.sin(u.yaw), 0, -Math.cos(u.yaw)); window.__R = R; window.__F = F;
    // цель — справа сзади-сбоку (башня разворачивается почти на 120°), камера — слева спереди, чтобы видеть и разворот, и подъём пакета
    C.ctrl.camera = () => {
      if (window.__front) { // CAM=front — перед торцами пакета (поворачивается с башней): видно крышки контейнеров и выход ракеты
        const cam = C.camera, p = u.pos, th = u.yaw + u.lyaw, f = new THREE.Vector3(-Math.sin(th), 0, -Math.cos(th)), r = new THREE.Vector3(-f.z, 0, f.x);
        cam.position.set(p.x + f.x * 8 + r.x * 3.5, p.y + 4.2, p.z + f.z * 8 + r.z * 3.5); cam.lookAt(p.x + f.x * 2.2, p.y + 2.4, p.z + f.z * 2.2); cam.updateMatrixWorld(); return;
      }
      const cam = C.camera, p = u.pos, m = window.__cam, d = m.mode === 'aim' ? 8 : 15, h = m.mode === 'aim' ? 3.2 : 5;
      cam.position.set(p.x - R.x * d * 0.8 + F.x * d * 0.6, p.y + h, p.z - R.z * d * 0.8 + F.z * d * 0.6);
      cam.lookAt(p.x, p.y + (m.mode === 'aim' ? 1.8 : 5), p.z); cam.updateMatrixWorld();
    };
    return { id: u.id, key: u.key, ammo: u.ammo, yaw: +u.yaw.toFixed(2) };
  }, key, Deno.env.get('CAM') === 'front');
  if (!found) throw new Error(`в бою нет «${key}»`);
  const step = (n, snap) => page.evaluate((n, FPS, snap) => {
    for (let q = 0; q < n; q++) { window.__t += 1000 / FPS; window.__a.paused = false; window.__frame(window.__t); }
    if (!snap) return null;
    const src = window.__a.renderer.domElement, cv = window.__cv || (window.__cv = document.createElement('canvas')); cv.width = src.width; cv.height = src.height;
    cv.getContext('2d').drawImage(src, 0, 0); return cv.toDataURL('image/jpeg', 0.9);
  }, n, FPS, !!snap);
  const save = (name, url) => Deno.writeFileSync(`${out}/${name}.jpg`, Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0)));
  // в покое: цель далеко, пусковая — в походном (азимут и угол места 0), подробная модель грузится, пока камера рядом
  const calm = () => page.evaluate(() => { const C = window.__a, u = window.__u, P = C.player; if (P) P.pos.set(u.pos.x + 60000, u.pos.y + 3000, u.pos.z); u.track = null; u.cool = 99; u.seeT = 0; u.lyaw = 0; u.lel = window.__lel0 ?? 0; u.lnEl = null; });
  for (let i = 0; i < 90; i++) { await calm(); await step(1); if (i % 10 === 9) await new Promise((r) => setTimeout(r, 300)); }
  await calm(); save(`${key}-0-rest`, await step(1, true));
  // цель: справа-сзади, уходит от машины (хвост к ней), сопровождение — сразу; пуск — когда пусковая навелась
  const hold = () => page.evaluate((D, H) => {
    const C = window.__a, u = window.__u, P = C.player, R = window.__R, F = window.__F; if (!P) return;
    const dir = new THREE.Vector3().addScaledVector(R, 0.6).addScaledVector(F, -0.8).normalize();
    P.pos.set(u.pos.x + dir.x * D, u.pos.y + H, u.pos.z + dir.z * D); if (P.vel) P.vel.copy(dir).multiplyScalar(150); P.yaw = Math.atan2(-dir.x, -dir.z); P.pitch = 0; P.dead = false; if (P.hp !== undefined) P.hp = Math.max(P.hp, 50); // нос — от комплекса: ИК-ГСН видит хвост
    u.track = P; u.seeT = 99; u.lostT = 0; u.reactT = 99; u.emit = true;
  }, +distArg, +hArg);
  await page.evaluate(() => { window.__u.cool = 0; window.__mid0 = Math.max(-1, ...window.__a.S.sams.map((q) => q.id)); });
  const log = []; let launched = -1;
  for (let f = 0; f < FPS * (8 + SEC); f++) {
    await hold(); const url = await step(1, true);
    const r = await page.evaluate(() => {
      const C = window.__a, u = window.__u, m = C.S.sams.find((q) => q.unit === u && !q.dead && q.id > window.__mid0), gy = C.city.groundH(u.pos.x, u.pos.z);
      const o = { lyaw: +(u.lyaw * 57.3).toFixed(0), lel: +(u.lel * 57.3).toFixed(0), err: +(u.lnErr * 57.3).toFixed(1) };
      if (m) Object.assign(o, { t: +m.t.toFixed(2), h: +(m.pos.y - gy).toFixed(1), v: +m.speed.toFixed(0), lit: !!m.lit });
      return o;
    });
    log.push(r);
    if (launched < 0 && r.t !== undefined) { launched = f; await page.evaluate(() => { window.__cam.mode = 'wide'; }); }
    save(`${key}-${String(f).padStart(3, '0')}`, url);
    if (launched >= 0 && f - launched >= FPS * SEC) break;
  }
  console.log('наведение (каждые 0,5 с): ' + log.filter((_, i) => i % 15 === 0 && (launched < 0 || i <= launched)).map((r) => `аз ${r.lyaw}° уг ${r.lel}° (ошибка ${r.err}°)`).join(' · '));
  for (const r of log) if (r.t !== undefined && Math.abs(r.t * 4 - Math.round(r.t * 4)) < 0.07) console.log(`  t ${r.t.toFixed(2)} с: высота ${r.h} м, ${r.v} м/с, двигатель ${r.lit ? 'да' : 'нет'}`);
  const ff = new Deno.Command('ffmpeg', { args: ['-v', 'error', '-y', '-framerate', String(FPS), '-start_number', '0', '-i', `${out}/${key}-%03d.jpg`, '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', `${out}/${key}.mp4`] }).outputSync();
  if (!ff.success) console.log('ролик не собран:', new TextDecoder().decode(ff.stderr).slice(0, 300));
  console.log(JSON.stringify({ found, launchedAtFrame: launched, frames: log.length, video: `${out}/${key}.mp4`, errs: errs.slice(0, 5) }));
} finally { await browser.close(); }
