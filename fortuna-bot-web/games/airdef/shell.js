// Оболочка «Воздушного превосходства»: Telegram Mini App и браузер (как в «Летке», games/drone/main.js).
//  • Безопасные зоны: вырез и скругления экрана (env(safe-area-inset-*), у страницы-родителя, если игра во фрейме сайта) и
//    кнопки Telegram поверх страницы в полноэкранном режиме (contentSafeAreaInset) → CSS-переменные --sa-* и --tg-t.
//  • Telegram: ready / expand сразу; свайп вниз не сворачивает приложение (весь сеанс, а не только бой — им двигают ручку
//    и камеру); в бою — закрытие с подтверждением, полный экран Telegram (8.0+) и фиксация ориентации.
//  • Браузер: полный экран (без адресной строки) по первому касанию и при старте боя — если включено в настройках;
//    экран не гаснет (Wake Lock); «Назад» в бою — пауза, а не выход; закрытие вкладки в бою — с подтверждением.
//    iPhone Safari полный экран страницам не даёт — там помогает «На экран „Домой“»; iPad и Android — дают.
export function createShell(C, { IS_TOUCH, ls }) {
  const TG = (() => {
    try {
      const w = window.parent !== window ? window.parent : window, T = (w.Telegram && w.Telegram.WebApp) || (window.Telegram && window.Telegram.WebApp);
      return { W: T && T.platform && T.platform !== 'unknown' ? T : null, proxy: !!(w.TelegramWebviewProxy || window.TelegramWebviewProxy) };
    } catch (_) { return { W: null, proxy: false }; }
  })();
  const tgv = (v) => { try { return !!(TG.W && TG.W.isVersionAtLeast && TG.W.isVersionAtLeast(v)); } catch (_) { return false; } };
  const S = { fsPref: (ls.get('fortuna_airdef_fs') ?? '1') === '1', playing: false, wake: null, tgFs: false };

  // ── безопасные зоны ──
  function envInsets(win) {
    try {
      const d = win.document.createElement('div');
      d.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
      win.document.body.appendChild(d); const cs = win.getComputedStyle(d);
      const r = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map((v) => parseFloat(v) || 0); d.remove(); return r;
    } catch (_) { return [0, 0, 0, 0]; }
  }
  function applySafeArea() {
    const ins = envInsets(window);
    if (window.parent !== window) envInsets(window.parent).forEach((v, i) => { ins[i] = Math.max(ins[i], v); });
    let tg = 0;
    if (TG.W) {
      const a = TG.W.safeAreaInset || {}, c = TG.W.contentSafeAreaInset || {};
      ins[0] = Math.max(ins[0], a.top || 0); ins[1] = Math.max(ins[1], a.right || 0); ins[2] = Math.max(ins[2], a.bottom || 0); ins[3] = Math.max(ins[3], a.left || 0);
      tg = c.top || (TG.W.isFullscreen ? 46 : 0);
    } else if (TG.proxy && IS_TOUCH && Math.abs(window.innerHeight - (screen.height < screen.width === window.innerHeight < window.innerWidth ? screen.height : screen.width)) < 4) tg = 46;
    try {
      const st = document.documentElement.style;
      ['t', 'r', 'b', 'l'].forEach((k, i) => st.setProperty('--sa-' + k, Math.round(ins[i]) + 'px'));
      st.setProperty('--tg-t', Math.round(tg) + 'px');
      document.body.classList.toggle('tgfs', tg > 0);
    } catch (_) { /* без DOM (проверки) */ }
  }
  applySafeArea();
  addEventListener('resize', applySafeArea); addEventListener('orientationchange', () => setTimeout(applySafeArea, 300));
  if (TG.W) {
    for (const ev of ['safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'viewportChanged']) try { TG.W.onEvent(ev, applySafeArea); } catch (_) { /* старый клиент */ }
    try { TG.W.ready(); TG.W.expand(); } catch (_) { /* нет */ }
    try { if (tgv('7.7')) TG.W.disableVerticalSwipes(); } catch (_) { /* нет */ } // свайп вниз не сворачивает игру
  }

  // ── полный экран браузера ──
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  async function browserFs() {
    if (!S.fsPref || TG.W || fsEl()) return;
    const root = document.documentElement;
    try { if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' }); else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen(); } catch (_) { /* не разрешено (iPhone, фрейм без allow) */ }
  }
  // первое касание: браузер даёт полный экран только по жесту
  addEventListener('pointerdown', () => { browserFs(); }, { once: true });
  async function wake(on) {
    try { if (on && navigator.wakeLock && !S.wake) S.wake = await navigator.wakeLock.request('screen'); else if (!on && S.wake) { S.wake.release(); S.wake = null; } } catch (_) { /* не везде */ }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.playing) wake(true); }); // Wake Lock снимается при сворачивании

  // ── бой: включить / выключить защиту от случайного выхода ──
  function play(on) {
    if (S.playing === on) return; S.playing = on;
    const T = TG.W;
    if (T) try {
      if (tgv('6.2')) on ? T.enableClosingConfirmation() : T.disableClosingConfirmation();
      if (tgv('8.0')) {
        if (on && S.fsPref) { if (!T.isFullscreen) { S.tgFs = true; T.requestFullscreen(); } if (IS_TOUCH) T.lockOrientation(); }
        if (!on) { try { T.unlockOrientation(); } catch (_) { /* нет */ } }
      }
    } catch (_) { /* метод недоступен в этой версии Telegram */ }
    if (on) { browserFs(); wake(true); try { if (IS_TOUCH && screen.orientation && screen.orientation.lock) screen.orientation.lock(screen.orientation.type.startsWith('landscape') ? 'landscape' : 'portrait').catch(() => {}); } catch (_) { /* не везде */ } try { history.pushState({ airdef: 1 }, ''); } catch (_) { /* песочница */ } }
    else { wake(false); try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (_) { /* нет */ } }
  }
  // «Назад» (жест или кнопка) в бою — пауза; закрытие вкладки в бою — с подтверждением
  addEventListener('popstate', () => { if (S.playing && C.state === 'play') { if (!C.paused && C.togglePause) C.togglePause(); try { history.pushState({ airdef: 1 }, ''); } catch (_) { /* нет */ } } });
  addEventListener('beforeunload', (e) => { if (S.playing && C.state === 'play') { e.preventDefault(); e.returnValue = ''; } });

  return {
    TG, play, applySafeArea,
    get fsPref() { return S.fsPref; },
    setFs(on) { S.fsPref = !!on; ls.set('fortuna_airdef_fs', on ? '1' : '0'); if (on) browserFs(); else if (fsEl()) try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (_) { /* нет */ } },
    canFs: () => !!(TG.W ? tgv('8.0') : document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen),
  };
}
