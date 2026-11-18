// Оплата за Telegram Stars (Mark 2026-11-19): премиум и кристаллы. Сервер (airdef-shop, sql/037) выдаёт счёт и сам начисляет по платежу от Telegram; здесь - только
// запрос счёта, показ и ожидание. Внутри Telegram - WebApp.openInvoice (итог 'paid' → опрос заказа раз в 1,5 с до ~60 с); в обычном браузере - ссылка на счёт в новой
// вкладке и опрос раз в 3 с до 10 минут, пока окно ждёт. Состояния для окна магазина: idle, creating, tg (счёт открыт в Telegram), polling (оплачено, зачисляем),
// wait (ждём оплату в Telegram), done. Итог - слушатели on(f): { type: 'paid', key, wallet, season } | { type: 'state' } (смена состояния) | { type: 'error', text }.
import { tr, trIf, LANG } from './i18n.js?v=20261118d';
import { activeAcc, callFn } from './account.js?v=20261118d';

const TG = () => { // Telegram.WebApp - в окне или у страницы-родителя (как shell.js); null - обычный браузер
  try { const w = window.parent !== window ? window.parent : window, T = (w.Telegram && w.Telegram.WebApp) || (window.Telegram && window.Telegram.WebApp); return T && T.platform && T.platform !== 'unknown' ? T : null; } catch (_) { return null; }
};

export function createPay(C) {
  const S = { st: 'idle', key: null, order: null, link: '', blocked: false, gen: 0, err: '', wake: null };
  const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); S.wake = () => { clearTimeout(t); r(); }; }); // wake - не ждать шага опроса (вернулись на вкладку)
  const subs = [];
  const emit = (e) => { for (const f of subs) try { f(e || { type: 'state' }); } catch (x) { console.warn('pay', x); } };
  const set = (st, extra) => { Object.assign(S, { st }, extra); emit(); };
  const player = () => { const a = activeAcc(); return a && a.kind === 'airdef' ? a.id : ''; };
  const fail = (text) => { S.err = text; emit({ type: 'error', text }); set('idle', { order: null, link: '', blocked: false }); };

  // опрос заказа: every мс, до deadline мс; true - заказ оплачен (кошелёк уже у слушателей)
  async function poll(g, every, deadline) {
    const t0 = Date.now();
    while (g === S.gen && Date.now() - t0 < deadline) {
      try {
        const d = await callFn('airdef-shop', { player_id: player(), action: 'order', order: S.order });
        if (g !== S.gen) return false;
        if (d.status === 'paid') { const key = S.key; set('done', { order: null }); if (d.wallet && C.progress) C.progress.setPrem(d.wallet.premium_until); emit({ type: 'paid', key, wallet: d.wallet, season: d.season }); set('idle', { key: null, link: '', blocked: false }); return true; }
        if (d.status === 'refunded') { fail(tr('Платёж возвращён')); return false; }
      } catch (e) { if (e && e.status === 404) { fail(trIf(e.message)); return false; } /* сеть моргнула - ждём дальше */ }
      await sleep(every);
    }
    return false;
  }

  const api = {
    get st() { return S.st; }, get key() { return S.key; }, get link() { return S.link; }, get blocked() { return S.blocked; }, get err() { return S.err; },
    get busy() { return S.st !== 'idle'; },
    on(f) { subs.push(f); },
    async start(key) {
      if (S.st !== 'idle') return false;
      const pid = player(); if (!pid) return false;
      const g = ++S.gen; S.err = ''; set('creating', { key, order: null, link: '', blocked: false });
      let d;
      try { d = await callFn('airdef-shop', { player_id: pid, action: 'invoice', key, lang: LANG }); }
      catch (e) { if (g === S.gen) fail(trIf(e.message) || tr('Нет связи с сайтом')); return false; }
      if (g !== S.gen) return false; // отменили, пока ждали счёт
      S.order = d.order; S.link = d.link;
      const T = TG();
      if (T && typeof T.openInvoice === 'function' && (!T.isVersionAtLeast || T.isVersionAtLeast('6.1'))) {
        set('tg');
        try {
          T.openInvoice(d.link, async (status) => {
            if (g !== S.gen) return;
            if (status === 'paid' || status === 'pending') { set('polling'); if (!(await poll(g, 1500, 60000)) && g === S.gen && S.st === 'polling') fail(tr('Платёж ещё обрабатывается. Премиум или кристаллы появятся в течение минуты, если нет - напишите в поддержку.')); }
            else set('idle', { order: null, link: '', blocked: false }); // cancelled / failed - тихо вернуть кнопку
          });
        } catch (_) { fail(tr('Не удалось открыть счёт. Попробуйте ещё раз.')); }
        return true;
      }
      // браузер (или Telegram старше 6.1): счёт - ссылкой, ждём оплату, пока окно открыто
      let w = null;
      try { if (T && typeof T.openTelegramLink === 'function') { T.openTelegramLink(d.link); w = {}; } else w = window.open(d.link, '_blank', 'noopener'); } catch (_) { w = null; }
      set('wait', { blocked: !w });
      const ok = await poll(g, 3000, 600000);
      if (!ok && g === S.gen && S.st === 'wait') set('idle', { order: null, link: '', blocked: false }); // 10 минут вышли
      return true;
    },
    // «Отмена» в окне ожидания: опрос прекращается (оплатить уже открытый счёт можно, премиум придёт при следующем входе)
    cancel() { if (S.st === 'idle') return; S.gen++; set('idle', { order: null, link: '', blocked: false }); },
    clearErr() { S.err = ''; },
  };
  // вернулись на вкладку игры из Telegram (браузер) - проверить заказ сразу, не дожидаясь шага опроса
  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', () => { if (!document.hidden && S.st === 'wait' && S.wake) S.wake(); });
  return api;
}
