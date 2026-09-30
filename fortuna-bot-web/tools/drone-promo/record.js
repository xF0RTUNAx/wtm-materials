// Запись рекламного ролика media/letka_promo.mp4 (версия 2026-09-30: «Кино» + «Тестовая улучшенная графика», TAA, закат). Порядок:
//  1. python3 fortuna-bot-web/tools/drone-promo/frame-server.py        (приёмник кадров, порт 8936)
//  2. открыть games/drone.html?mode=training&test=1&seed=7 с пресетом «Кино», погодой «Закат», в «Настройках» — «Тестовая
//     улучшенная графика» и сглаживание TAA (или localStorage: fortuna_drone_gfx=cinema, fortuna_drone_weather=sunset,
//     fortuna_drone_perf={"preset":"cinema","fxTest":true,"aa":"taa","halfFx":true,"dyn":false,"scale":1,"fxv":2}),
//     окно 1920×1080, вставить этот скрипт в консоль; игра останавливается, кадры считаются по одному с шагом 1/30 с и уходят
//     на приёмник (window.__rec — счётчик, __recDone — конец). В облачной сессии — Playwright + SwiftShader (≈ 1 ч на 400 кадров).
//  3. ffmpeg -framerate 30 -i frames/f%05d.jpg -vf "scale=960:540:flags=lanczos,fade=t=in:st=0:d=0.25,fade=t=out:st=13.05:d=0.28,format=yuv420p" \
//       -c:v libx264 -preset slow -crf 25 -movflags +faststart -an letka_promo.mp4 ; постер — кадр 60 в letka_promo.jpg
//     (в облаке ffmpeg с libx264 — из npm: npm i @ffmpeg-installer/linux-x64)
(async () => {
  const g = __g, p = g.player, cam = g.camera, V = THREE.Vector3;
  window.requestAnimationFrame = () => 0;
  document.getElementById('hud').style.display = 'none';
  document.getElementById('menu').classList.remove('on');
  g.G.god = true; g.begin();
  const canvas = document.getElementById('c');
  let n = 0;
  window.__rec = 0; window.__recDone = false;
  const snap = () => new Promise((res) => canvas.toBlob((b) => { fetch('http://127.0.0.1:8936/?n=' + (n++), { method: 'POST', body: b }).then(() => res(), () => res()); }, 'image/jpeg', 0.92));
  const fwd = new V(), right = new V(), up = new V(0, 1, 0);
  const basis = () => { fwd.set(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch)); right.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw)); };
  const shot = async (frames, before, camFn) => { for (let i = 0; i < frames; i++) { before && before(i); g.tick(1 / 30); basis(); camFn(i, frames); cam.updateMatrixWorld(); g.render(); await snap(); window.__rec = n; } };
  const H = g.terrainH, SUNYAW = 1.22;

  // 1) низкий пролёт к заходящему солнцу на форсаже: «ромбы» и дрожание воздуха за соплом, камера сбоку чуть сзади
  p.pos.set(3500, 0, 5200); p.pos.y = H(p.pos.x, p.pos.z) + 170; p.yaw = SUNYAW; p.pitch = 0; p.roll = 0; p.speed = 330; p.wy = p.wp = 0;
  g.held.add('ab');
  await shot(115, (i) => { g.input.sx = 0.06 * Math.sin(i / 20); const want = H(p.pos.x, p.pos.z) + 170; g.input.sy = Math.max(-0.5, Math.min(0.5, (want - p.pos.y) * 0.02 - p.pitch * 2)); },
    (i) => { const k = i / 115; cam.position.copy(p.pos).addScaledVector(right, -24 + k * 8).addScaledVector(up, 3.5).addScaledVector(fwd, -22 + k * 10); cam.up.set(0, 1, 0); cam.lookAt(p.pos.clone().addScaledVector(fwd, 45)); });
  g.held.delete('ab');

  // 2) пуск AIM-9L (густой дымный след) по «Слизню»: сначала из-за дрона, потом камера сбоку от цели — попадание и взрыв крупно
  p.pos.set(-1500, 2300, 1500); p.yaw = SUNYAW; p.pitch = 0.02; p.roll = 0; p.speed = 300; p.wy = p.wp = 0; basis();
  const e = g.spawnAI('fighter', p.pos.clone().addScaledVector(fwd, 700).addScaledVector(right, 60).addScaledVector(up, 25), SUNYAW);
  e.hp = 1; e.speed = 250; e.cmFlare = 0; e.cmChaff = 0; /* без ловушек — ракета гарантированно попадает */ let launched = false; const hold = new V(), look = new V(); let held = false;
  await shot(155, (i) => { g.input.sx = 0; g.input.sy = 0; if (i === 10 && !launched) { launched = true; g.launchMissile(p, 'aim9l', e, null); } },
    (i) => {
      if (i < 40) { cam.position.copy(p.pos).addScaledVector(fwd, -20).addScaledVector(up, 5).addScaledVector(right, 7); cam.up.set(0, 1, 0); cam.lookAt(p.pos.clone().addScaledVector(fwd, 400)); return; }
      // сбоку от цели: ракета прилетает в кадр, взрыв — крупно; после сбития камера остаётся на месте
      if (!e.dead) { const ef = new V(-Math.sin(e.yaw), 0, -Math.cos(e.yaw)), er = new V(Math.cos(e.yaw), 0, -Math.sin(e.yaw)); hold.copy(e.pos).addScaledVector(er, 30).addScaledVector(up, 5).addScaledVector(ef, -12); look.copy(e.pos).addScaledVector(ef, -10); }
      cam.position.copy(hold); cam.up.set(0, 1, 0); cam.lookAt(look);
    });

  // 3) облёт вокруг дрона в вираже: ЛТЦ и диполи, конденсат на крыле, солнце в кадре
  p.pos.set(-4000, 2000, -1000); p.yaw = SUNYAW + 0.8; p.pitch = 0.05; p.roll = 0; p.speed = 300; p.wy = p.wp = 0;
  await shot(130, (i) => { g.input.sx = 0.55; g.input.sy = 0.35; if (i % 7 === 0 && i > 15 && i < 95) g.dropCM(p, i % 14 === 0 ? 'chaff' : 'flare'); },
    (i) => { const a = 2.4 + i * 0.022; cam.position.set(p.pos.x + Math.sin(a) * 30, p.pos.y + 5 - i * 0.02, p.pos.z + Math.cos(a) * 30); cam.up.set(0, 1, 0); cam.lookAt(p.pos); });
  g.input.sx = 0; g.input.sy = 0;
  window.__recDone = true;
})();
