// Headless-сценарий: меню → вылет с ботом 120 с → кадры цикла → (обучение) → отрисовка вкладок. Печатает OK/FAIL по шагам.
var SP = ''; // запускать из папки tools/drone-headless
globalThis.THREE_PATH = globalThis.THREE_PATH || 'three.min.js';
globalThis.SEARCH = globalThis.SEARCH || '?mode=training&test=1&seed=12345';
load(SP + 'harness.js');
var MAIN = globalThis.MAIN_PATH; // абсолютный путь к games/drone/main.js (задаёт run.sh)
var MODE_ARG = globalThis.MODE_ARG || 'arcade';
var GFX_ARG = globalThis.GFX_ARG || null;
if (GFX_ARG) localStorage.setItem('fortuna_drone_gfx', GFX_ARG);
localStorage.setItem('fortuna_drone_mode', MODE_ARG);
function step(name, f) { try { var r = f(); print('OK   ' + name + (r !== undefined ? ' → ' + JSON.stringify(r) : '')); } catch (e) { print('FAIL ' + name + ': ' + e + '\n' + e.stack); } }
import(MAIN).then(function () {
  var g = window.__g;
  print('module loaded; gfx=' + g.gfx() + ' mode=' + g.mode());
  step('menu frames', function () { runFrames(30, 16); return g.G.state; });
  step('begin', function () { g.begin(); return g.G.state; });
  var hurtBefore = 0;
  step('fly 120 s with bot', function () {
    var dt = 1 / 60, shots = 0;
    for (var i = 0; i < 60 * 120 && g.G.state === 'play'; i++) {
      var p = g.player, best = null, bd = 1e9;
      for (var k = 0; k < g.enemies.length; k++) { var e = g.enemies[k]; if (e.dead) continue; var d = e.pos.distanceTo(p.pos); if (d < bd) { bd = d; best = e; } }
      if (best) {
        var rx = best.pos.x - p.pos.x, rz = best.pos.z - p.pos.z, ry = best.pos.y - p.pos.y;
        var wantYaw = Math.atan2(-rx, -rz), dy = wantYaw - p.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
        g.input.sx = Math.max(-1, Math.min(1, -dy * 3)); g.input.sy = Math.max(-1, Math.min(1, (Math.atan2(ry, Math.hypot(rx, rz)) - p.pitch) * 3));
      }
      if (p.pos.y < 800) g.input.sy = 1;
      g.input.fire = !!g.gunT();
      if (i % 30 === 0) { if (g.radar.contacts.size && !g.radar.lock) g.cycleLock(); if (g.radar.lock) { g.launchPlayerMissile(); shots++; } }
      if (i % 90 === 0) g.dropCM(g.player, 'flare');
      g.tick(dt); if (i % 10 === 0) { g.render(); g.updateHud(dt); }
    }
    runTimers();
    return { t: +g.G.runTime.toFixed(1), state: g.G.state, kills: g.G.kills, fired: g.G.mFired, mhits: g.G.mHits, hull: Math.round(g.player.hull), enemies: g.enemies.length, missiles: g.missiles.length, evaded: g.G.evaded };
  });
  step('raf frames', function () { runFrames(20, 16); return { fps: Math.round(g.dr.fps), pipe: !!g.pipe(), scale: g.pipe() ? g.pipe().scale : null }; });
  if (MODE_ARG === 'training') {
    step('training 150 s', function () {
      var dt = 1 / 60, phases = {}, asks = 0, lessons = 0;
      for (var i = 0; i < 60 * 150; i++) {
        if (g.G.state === 'pause' && g.G.lesson) g.closeLesson();
        var p = g.player; g.input.sy = p.pos.y < 1500 ? 0.8 : (p.pos.y > 4000 ? -0.3 : 0); g.input.sx = 0.1;
        if (g.TR.ask && i % 200 === 0) { g.openLesson(g.TR.ask); lessons++; }
        if (i % 120 === 0) g.dropCM(g.player, 'chaff');
        phases[g.TR.phase] = (phases[g.TR.phase] || 0) + 1;
        if (g.G.state === 'play') g.tick(dt);
        if (i % 15 === 0) { g.render(); g.updateHud(dt); }
      }
      runTimers();
      return { done: g.TR.done, phases: Object.keys(phases), lessons: lessons, hull: Math.round(g.player.hull), state: g.G.state };
    });
  }
  step('settings/guide render', function () { g.renderAll && g.renderAll(); return 'ok'; });
}).catch(function (e) { print('LOAD FAIL: ' + e + '\n' + (e && e.stack)); });
