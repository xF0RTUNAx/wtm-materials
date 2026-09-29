// Запись рекламного ролика media/letka_promo.mp4 (сентябрь 2026). Порядок:
//  1. python3 fortuna-bot-web/tools/drone-promo/frame-server.py        (приёмник кадров, порт 8936)
//  2. открыть games/drone.html?mode=training&test=1 с пресетом «Кино» и погодой «Закат», вставить этот скрипт в консоль;
//     игра останавливается, кадры считаются по одному с шагом 1/30 с и уходят на приёмник (window.__rec — счётчик, __recDone — конец)
//  3. ffmpeg -framerate 30 -i frames/f%05d.jpg -vf "scale=960:540:flags=lanczos,fade=t=in:st=0:d=0.25,fade=t=out:st=13.05:d=0.28,format=yuv420p" \
//       -c:v libx264 -preset slow -crf 25 -movflags +faststart -an letka_promo.mp4 ; постер — кадр 60 в letka_promo.jpg
// В итоговом ролике план 2 переснимался: камера сбоку от «Слизня», попадание AIM-9X, крупный план взрыва; камеру после сбития
// держали на последнем положении (иначе updateCamera в tick её перескакивал). Ниже — рабочая версия скрипта, планы правятся под задачу.
(async () => {
  const g = __g, p = g.player, cam = g.camera, V = THREE.Vector3;
  window.requestAnimationFrame = () => 0; // остановить обычный цикл — кадры ведём сами
  document.getElementById('hud').style.display = 'none';
  document.getElementById('menu').classList.remove('on');
  g.G.god = true; g.begin();
  const canvas = document.getElementById('c');
  let n = 0;
  window.__rec = 0; window.__recDone = false;
  const snap = () => new Promise((res) => canvas.toBlob((b) => { fetch('http://127.0.0.1:8936/?n=' + (n++), { method: 'POST', body: b }).then(() => res(), () => res()); }, 'image/jpeg', 0.92));
  const fwd = new V(), right = new V(), up = new V(0, 1, 0);
  const basis = () => { fwd.set(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch)); right.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw)); };
  const shot = async (frames, before, camFn) => { for (let i = 0; i < frames; i++) { before && before(i); g.tick(1 / 30); basis(); camFn(i, frames); g.render(); await snap(); window.__rec = n; } };
  const H = g.terrainH, SUNYAW = 1.22;

  // 1) низкий пролёт над долиной к заходящему солнцу, форсаж, камера сбоку чуть сзади
  p.pos.set(3500, 0, 5200); p.pos.y = H(p.pos.x, p.pos.z) + 170; p.yaw = SUNYAW; p.pitch = 0; p.roll = 0; p.speed = 330; p.wy = p.wp = 0;
  g.held.add('ab');
  await shot(120, (i) => { g.input.sx = 0.06 * Math.sin(i / 20); const want = H(p.pos.x, p.pos.z) + 170; g.input.sy = Math.max(-0.5, Math.min(0.5, (want - p.pos.y) * 0.02 - p.pitch * 2)); },
    (i) => { const k = i / 120; cam.position.copy(p.pos).addScaledVector(right, -26 + k * 8).addScaledVector(up, 3.5).addScaledVector(fwd, -24 + k * 10); cam.up.set(0, 1, 0); cam.lookAt(p.pos.clone().addScaledVector(fwd, 45)); });
  g.held.delete('ab');

  // 2) пуск ракеты по «Слизню» впереди: след ракеты, попадание, взрыв
  p.pos.set(-1500, 2300, 1500); p.yaw = SUNYAW; p.pitch = 0.02; p.roll = 0; p.speed = 300; p.wy = p.wp = 0; basis();
  const e = g.spawnAI('fighter', p.pos.clone().addScaledVector(fwd, 780).addScaledVector(right, 60).addScaledVector(up, 25), SUNYAW);
  e.hp = 1; e.speed = 250; let launched = false;
  await shot(150, (i) => { g.input.sx = 0; g.input.sy = 0; if (i === 18 && !launched) { launched = true; g.launchMissile(p, 'aim120c', e, null); } },
    (i) => { cam.position.copy(p.pos).addScaledVector(fwd, -22).addScaledVector(up, 6).addScaledVector(right, 7); cam.up.set(0, 1, 0); cam.lookAt(p.pos.clone().addScaledVector(fwd, 420)); });

  // 3) облёт вокруг дрона в вираже, отстрел ЛТЦ, солнце в кадре
  p.pos.set(-4000, 2000, -1000); p.yaw = SUNYAW + 0.8; p.pitch = 0.05; p.roll = 0; p.speed = 280; p.wy = p.wp = 0;
  await shot(130, (i) => { g.input.sx = 0.45; g.input.sy = 0.15; if (i % 7 === 0 && i > 20 && i < 90) g.dropCM(p, 'flare'); },
    (i) => { const a = 2.4 + i * 0.022; cam.position.set(p.pos.x + Math.sin(a) * 30, p.pos.y + 5 - i * 0.02, p.pos.z + Math.cos(a) * 30); cam.up.set(0, 1, 0); cam.lookAt(p.pos); });
  g.input.sx = 0; g.input.sy = 0;
  window.__recDone = true;
})();
