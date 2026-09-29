// Headless-сценарий: меню → вылет с ботом 120 с → кадры цикла → (обучение) → отрисовка вкладок. Печатает OK/FAIL по шагам.
var SP = ''; // запускать из папки tools/drone-headless
globalThis.THREE_PATH = globalThis.THREE_PATH || 'three.min.js';
globalThis.SEARCH = globalThis.SEARCH || '?mode=training&test=1&seed=12345';
load(SP + 'harness.js');
// детерминированный Math.random: одинаковый прогон до и после рефакторинга даёт одинаковую контрольную сумму боя
(function () { var a = 987654321; Math.random = function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; globalThis.RNDN = (globalThis.RNDN || 0) + 1; if (globalThis.STK) { var st = (new Error().stack || '').split('\n').slice(1, 4).map(function (l) { return l.replace(/@.*\/(\w+\.js):(\d+):\d+/, '@$1:$2'); }).join(' < '); STK[st] = (STK[st] || 0) + 1; } return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
function simHash(g) { // контрольная сумма состояния боя: игрок, враги, ракеты, счёт
  var h = 0, add = function (v) { h = (h * 31 + Math.round(v * 1000)) % 2147483647; };
  var p = g.player; add(p.pos.x); add(p.pos.y); add(p.pos.z); add(p.speed); add(p.hull); add(p.fuel);
  g.enemies.forEach(function (e) { add(e.pos.x); add(e.pos.y); add(e.pos.z); add(e.hp); });
  g.missiles.forEach(function (m) { add(m.pos.x); add(m.pos.y); add(m.pos.z); add(m.speed); });
  add(g.G.kills); add(g.G.score); add(g.G.mFired); add(g.G.mHits); add(g.G.evaded);
  return h;
}
var MAIN = globalThis.MAIN_PATH; // абсолютный путь к games/drone/main.js (задаёт run.sh)
var MODE_ARG = globalThis.MODE_ARG || 'arcade';
var GFX_ARG = globalThis.GFX_ARG || null;
if (GFX_ARG) localStorage.setItem('fortuna_drone_gfx', GFX_ARG);
localStorage.setItem('fortuna_drone_mode', MODE_ARG);
if (globalThis.WEATHER_ARG) localStorage.setItem('fortuna_drone_weather', globalThis.WEATHER_ARG);
function step(name, f) { try { var r = f(); print('OK   ' + name + (r !== undefined ? ' → ' + JSON.stringify(r) : '')); } catch (e) { print('FAIL ' + name + ': ' + e + '\n' + e.stack); } }
import(MAIN).then(function () {
  var g = window.__g;
  print('module loaded; gfx=' + g.gfx() + ' mode=' + g.mode());
  step('refresh probe', function () { runFrames(20, 16); return 'ok'; });
  return Promise.resolve().then(function () {}).then(function () {}).then(function () {}).then(function () { // дать отработать measureRefresh → старт цикла
  step('menu frames', function () { runFrames(30, 16); return { state: g.G.state, vs: +g.dr.vs.toFixed(2) }; });
  step('begin', function () { g.begin(); if (globalThis.GOD_ARG === 'god') g.G.god = true; return g.G.state; });
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
      if (globalThis.TRACE && i === 834) globalThis.STK = {}; if (globalThis.TRACE && i === 840) { var ks = Object.keys(STK).sort(); ks.forEach(function (k) { print('S ' + STK[k] + ' ' + k); }); globalThis.STK = null; }
      g.tick(dt); if (globalThis.TRACE && i % 6 === 0) print('T ' + i + ' ' + globalThis.RNDN + ' ' + simHash(g) + ' e' + g.enemies.length + ' m' + g.missiles.length); if (i % 10 === 0) { g.render(); g.updateHud(dt); }
    }
    runTimers();
    return { hash: simHash(g), t: +g.G.runTime.toFixed(1), state: g.G.state, kills: g.G.kills, fired: g.G.mFired, mhits: g.G.mHits, hull: Math.round(g.player.hull), enemies: g.enemies.length, missiles: g.missiles.length, evaded: g.G.evaded };
  });
  step('raf frames', function () { runFrames(45, 16); return { vs: +g.dr.vs.toFixed(2), win: g.dr.win.length, t: g.dr.t, st: g.G.state, fps: Math.round(g.dr.fps), pipe: !!g.pipe(), scale: g.pipe() ? g.pipe().scale : null }; });
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
      return { hash: simHash(g), done: g.TR.done, phases: Object.keys(phases), lessons: lessons, hull: Math.round(g.player.hull), state: g.G.state };
    });
  }
  step('settings/guide render', function () { g.renderAll && g.renderAll(); return 'ok'; });
  step('weather cycle', function () {
    var out = [];
    Object.keys(g.WEATHERS).forEach(function (k) { g.applyWeatherKey(k); for (var i = 0; i < 20; i++) { g.tick(1 / 30); g.render(); } out.push(k + ':' + g.world.W.name); });
    return out.join(', ');
  });
  step('upscale compare UI', function () {
    var r = { imgs: ['a', 'b', 'c'], fps: 60 };
    g.showUpscaleResult([Object.assign({ name: 'n' }, r), Object.assign({ name: 'b' }, r), Object.assign({ name: 'c' }, r), Object.assign({ name: 'f' }, r)], 16 / 9);
    return 'ok';
  });
  });
}).catch(function (e) { print('LOAD FAIL: ' + e + '\n' + (e && e.stack)); });
