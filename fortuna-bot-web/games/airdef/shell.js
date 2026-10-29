// Оболочка «Воздушного превосходства»: Telegram Mini App и браузер (как в «Летке», games/drone/main.js).
//  • Безопасные зоны: вырез и скругления экрана (env(safe-area-inset-*), у страницы-родителя, если игра во фрейме сайта) и
//    кнопки Telegram поверх страницы в полноэкранном режиме (contentSafeAreaInset) → CSS-переменные --sa-* и --tg-t.
//  • Telegram: ready / expand сразу; свайп вниз не сворачивает приложение (весь сеанс, а не только бой — им двигают ручку
//    и камеру); в бою — закрытие с подтверждением, полный экран Telegram (8.0+) и фиксация ориентации.
//  • Браузер: полный экран (без адресной строки) по первому касанию и при старте боя — если включено в настройках;
//    экран не гаснет (Wake Lock); «Назад» в бою — пауза, а не выход; закрытие вкладки в бою — с подтверждением.
//    iPhone Safari полный экран страницам не даёт — там помогает «На экран „Домой“»; iPad и Android — дают.
import { tr } from './i18n.js?v=20261029b';
import { ico } from './icons.js?v=20261029b';
export function createShell(C, { IS_TOUCH, ls }) {
  const TG = (() => {
    try {
      const w = window.parent !== window ? window.parent : window, T = (w.Telegram && w.Telegram.WebApp) || (window.Telegram && window.Telegram.WebApp);
      return { W: T && T.platform && T.platform !== 'unknown' ? T : null, proxy: !!(w.TelegramWebviewProxy || window.TelegramWebviewProxy) };
    } catch (_) { return { W: null, proxy: false }; }
  })();
  const tgv = (v) => { try { return !!(TG.W && TG.W.isVersionAtLeast && TG.W.isVersionAtLeast(v)); } catch (_) { return false; } };
  // проверка (только ?test=1): insets=t,r,b,l,tg — эмуляция выреза и кнопок Telegram на ПК (как в «Летке»)
  const TEST_INSETS = (() => { try { const Q = new URLSearchParams(location.search); return Q.get('test') === '1' && Q.get('insets') ? Q.get('insets').split(',').map((v) => +v || 0) : null; } catch (_) { return null; } })();
  const S = { fsPref: (ls.get('fortuna_airdef_fs') ?? '1') === '1', fsHint: (ls.get('fortuna_airdef_fshint') ?? '1') === '1', playing: false, wake: null, tgFs: false }; // fsHint — кнопка / плашка возврата в полный экран (настройки)

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
    if (TEST_INSETS) { for (let i = 0; i < 4; i++) ins[i] = TEST_INSETS[i] || 0; tg = TEST_INSETS[4] || 0; }
    try {
      const st = document.documentElement.style;
      ['t', 'r', 'b', 'l'].forEach((k, i) => st.setProperty('--sa-' + k, Math.round(ins[i]) + 'px'));
      st.setProperty('--tg-t', Math.round(tg) + 'px');
      document.body.classList.toggle('tgfs', tg > 0);
      dispatchEvent(new Event('airdef-safearea')); // верх экрана сдвинулся — сенсорные кнопки вылета пересчитывают места (air.js layoutTouch)
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
  // полный экран слетел посреди боя (Mark 2026-10-27: «кнопкой, которая появляется в такие моменты», «где не будет мешать», на устройстве — один элемент):
  //  • Android, iPad, Telegram 8.0+ — кнопка ⛶ #fsBtn в ряду верхних кнопок, нажатие возвращает полный экран; на ПК не показываем (Esc — нарочно);
  //  • iPhone Safari полного экрана страницам не даёт, панели прячет только живой жест (прокрутка из кода — нет, проверено в симуляторе iOS 26.5):
  //    плашка #fsSwipe внизу по центру — по ней проводят вверх; на время боя страница чуть длиннее экрана (html.iosfs) и прокручивается, во фрейме
  //    сайта своя не прокручивается (html.iosfr) — свайп уходит странице сайта. Нажатие на плашку — подсказка
  const IOS_SAFARI = IS_TOUCH && /iP(hone|od)/.test(navigator.userAgent) && !navigator.standalone && !TG.W && !TG.proxy, IN_FRAME = window.top !== window;
  const fsBtn = document.getElementById('fsBtn'), fsSw = document.getElementById('fsSwipe');
  const barsShown = () => innerWidth > innerHeight && innerHeight < Math.min(screen.width, screen.height) - 30; // горизонталь, панели Safari видны
  function fsCheck() {
    let tap = false, swipe = false;
    if (S.playing && S.fsPref && S.fsHint && !document.body.classList.contains('endOn')) {
      if (TG.W) tap = S.tgFs && tgv('8.0') && !TG.W.isFullscreen;
      else if (IOS_SAFARI) swipe = barsShown();
      else if (IS_TOUCH && (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)) tap = !fsEl();
    }
    const ios = IOS_SAFARI && S.playing && S.fsPref && S.fsHint, root = document.documentElement.classList;
    root.toggle('iosfs', ios && !IN_FRAME); root.toggle('iosfr', ios && IN_FRAME); root.toggle('fsTap', tap); root.toggle('fsSwipe', swipe);
  }
  if (fsBtn) {
    fsBtn.innerHTML = ico('fullscreen');
    fsBtn.addEventListener('click', () => { if (TG.W) { try { TG.W.requestFullscreen(); } catch (_) { /* старый клиент */ } } else browserFs(); });
  }
  if (fsSw && IOS_SAFARI) {
    const chev = '<svg viewBox="0 0 18 12" aria-hidden="true"><path d="M2 10 9 3l7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    fsSw.innerHTML = `<span class="ch">${chev}${chev}</span><span>${tr('Потяните вверх для полноэкранного режима')}</span>`; // Mark 2026-10-27: «допиши, что потяните вверх для полноэкранного режима»
    document.documentElement.appendChild(fsSw); // вне <body>: у <body> touch-action: none, а по плашке проводят — прокручивается страница
    fsSw.addEventListener('click', () => C.say(tr('Проведите пальцем вверх по плашке — Safari спрячет панели'), 3)); // нажатие ничего не даёт — подскажем
  }
  const fsSoon = () => setTimeout(fsCheck, 120); // размеры окна после поворота и сворачивания панелей приходят не сразу
  addEventListener('resize', fsSoon); addEventListener('orientationchange', fsSoon); document.addEventListener('fullscreenchange', fsSoon); document.addEventListener('webkitfullscreenchange', fsSoon);
  if (TG.W) try { TG.W.onEvent('fullscreenChanged', fsCheck); } catch (_) { /* старый клиент */ }
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
    fsCheck();
  }
  // «Назад» (жест или кнопка) в бою — пауза; закрытие вкладки в бою — с подтверждением
  addEventListener('popstate', () => { if (S.playing && C.state === 'play') { if (!C.paused && C.togglePause) C.togglePause(); try { history.pushState({ airdef: 1 }, ''); } catch (_) { /* нет */ } } });
  addEventListener('beforeunload', (e) => { if (S.playing && C.state === 'play') { e.preventDefault(); e.returnValue = ''; } });

  return {
    TG, play, applySafeArea,
    get fsPref() { return S.fsPref; },
    setFs(on) { S.fsPref = !!on; ls.set('fortuna_airdef_fs', on ? '1' : '0'); if (on) browserFs(); else if (fsEl()) try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (_) { /* нет */ } fsCheck(); },
    get fsHint() { return S.fsHint; },
    setFsHint(on) { S.fsHint = !!on; ls.set('fortuna_airdef_fshint', on ? '1' : '0'); fsCheck(); },
    hintKind: () => (TG.W ? (tgv('8.0') ? 'tap' : '') : IOS_SAFARI ? 'swipe' : IS_TOUCH && (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen) ? 'tap' : ''), // что появится, когда полный экран слетит
    canFs: () => !!(TG.W ? tgv('8.0') : document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen),
  };
}
