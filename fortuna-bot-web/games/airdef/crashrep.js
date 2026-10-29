// Отчёт о вылете (Mark 2026-10-27: «заставить устройство в такие моменты сообщать об ошибке и попросить логи»). Журналы iOS странице недоступны,
// но она видит, что прошлый бой оборвался без выхода: в бою раз в 5 с — запись в хранилище вкладки (sessionStorage переживает вылет и
// перезагрузку этой вкладки, новой вкладке не видна); обычный уход со страницы (pagehide: перезагрузка, закрытие, переход) и конец боя её
// стирают, вылет — нет. Открылись с записью не старше 5 мин — окно «Игра закрылась с ошибкой»: «Отправить» — на игровой сервер (журнал
// ad_crash, без входа), не вышло — «Скопировать» для Telegram. Онлайн-бой — без окна: там отчёт уходит сам (online.js 'reload')
import { adServerUrl } from './net.js?v=20261029a';
import { tr } from './i18n.js?v=20261029a';

const K = 'fortuna_ad_alive', VER = new URL(import.meta.url).searchParams.get('v') || '';
const ss = { get(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch (_) { /* приватный режим */ } }, del(k) { try { sessionStorage.removeItem(k); } catch (_) { /* нет */ } } };

export function createCrashRep(C) {
  let prev = null;
  try { const o = JSON.parse(ss.get(K) || 'null'); if (o && Date.now() - o.t < 300000) prev = o; } catch (_) { /* испорчена */ }
  ss.del(K);
  addEventListener('pagehide', () => ss.del(K)); // ушли сами — не вылет
  let bt0 = 0;
  setInterval(() => { try { tick(); } catch (_) { /* запись — не важнее игры (стенды без renderer.info и т. п.) */ } }, 5000);
  function tick() {
    if (C.state !== 'play' || C.ended) { if (bt0) { bt0 = 0; ss.del(K); } return; }
    if (!bt0) bt0 = Date.now();
    const R = C.renderer, gm = R && R.info && R.info.memory, pm = performance.memory;
    ss.set(K, JSON.stringify({ t: Date.now(), v: VER, game: C.lastGame || '', q: C.P.name, map: C.MAP, wx: C.W_KEY, fps: C.fps || 0, geo: gm ? gm.geometries : 0, tex: gm ? gm.textures : 0,
      prog: R && R.info && R.info.programs ? R.info.programs.length : 0, heap: pm ? Math.round(pm.usedJSHeapSize / 1048576) : 0, pr: R && R.getPixelRatio ? Math.round(R.getPixelRatio() * 100) / 100 : 0, vw: C.VW, vh: C.VH,
      up: Math.round(performance.now() / 1000), bt: Math.round((Date.now() - bt0) / 1000), gpu: String(C.gpuName || '').slice(0, 60), ua: String(navigator.userAgent || '').slice(0, 160) }));
  }

  function send(rep) {
    return new Promise((ok, no) => {
      let ws; try { ws = new WebSocket(adServerUrl()); } catch (e) { no(e); return; }
      const to = setTimeout(() => { try { ws.close(); } catch (_) { /* уже */ } no(new Error('timeout')); }, 8000);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'crash', d: rep }));
      ws.onmessage = (e) => { let m = null; try { m = JSON.parse(e.data); } catch (_) { /* не наше */ } if (m && m.t === 'crashOk') { clearTimeout(to); try { ws.close(); } catch (_) { /* уже */ } ok(); } };
      ws.onerror = () => { clearTimeout(to); no(new Error('ws')); };
    });
  }
  function offer() {
    if (!prev || C.LIVE || C.state === 'play') return; // онлайн — отчёт ушёл сам; уже в бою (?go=) — не мешаем
    const rep = { ...prev, ago: Math.round((Date.now() - prev.t) / 1000) }, md = document.getElementById('netModal'); prev = null;
    if (!md) return;
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
    const draw = (msg, btns) => {
      md.innerHTML = `<div class="nmb"><b>${tr('Игра закрылась с ошибкой')}</b><p>${msg}</p><div class="nmr">${btns.map(([l, , alt], i) => `<button class="btn${alt ? ' alt' : ''}" data-cr="${i}">${l}</button>`).join('')}</div></div>`;
      md.onclick = (e) => { const b = e.target.closest('[data-cr]'); if (b) btns[+b.dataset.cr][1](); };
      md.classList.add('on');
    };
    const close = () => { md.classList.remove('on'); md.innerHTML = ''; md.onclick = null; };
    const copy = () => { try { navigator.clipboard.writeText(JSON.stringify(rep)); C.say(tr('Отчёт скопирован — перешлите его в Telegram'), 3); } catch (_) { /* нет буфера */ } close(); };
    draw(`${tr('Похоже, в прошлый раз игра вылетела в бою. Отправьте отчёт — он поможет найти причину.')}${ios ? `<br><span class="dim">${tr('Если вылетает часто: «Настройки» → «Конфиденциальность и безопасность» → «Аналитика и улучшения» → «Данные аналитики» — перешлите файлы, начинающиеся с WebKit или Jetsam.')}</span>` : ''}`,
      [[tr('Отправить'), () => {
        draw(tr('Отправляем…'), []);
        send(rep).then(() => { close(); C.say(tr('Отчёт отправлен — спасибо!'), 3); })
          .catch(() => draw(tr('Сервер игры сейчас недоступен. Скопируйте отчёт и перешлите его в Telegram.'), [[tr('Скопировать'), copy], [tr('Закрыть'), close, true]]));
      }], [tr('Не надо'), close, true]]);
  }
  return { offer, get prev() { return prev; } };
}
