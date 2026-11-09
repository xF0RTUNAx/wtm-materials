// Створки при входе в бой и выходе в меню (Mark 2026-11-01: «случайно одна из двух при каждом заходе и выходе»). Две половины -
// рендер Blender (стальные створки укрытия «07» и ворота ангара «42», текстуры Poly Haven CC0; прототипы v3) → ui/doors/<стиль>_l|r.webp.
// Створки съезжаются, бьются об уплотнитель, за закрытыми меняется экран (тяжёлая сборка боя - тоже за ними), рывок замка, расходятся.
// Без звука (Mark: ни записи, ни синтез для створок не подошли). Без анимации (reduce motion, скрытая вкладка, стенды в Chrome без окна) - сразу fn().
// Новая карта - перезагрузка страницы (Mark: «анимация створок прерывается»): carry() перед перезагрузкой запоминает стиль, новая страница
// открывается уже с закрытыми створками (airdef.html: #doorsBoot до загрузки модулей, потом - эти), на шве - ход загрузки; расходятся,
// когда карта загружена (gate) или бой онлайна открылся.
import { tr } from './i18n.js?v=20261109a';

const STY = ['has', 'hangar'], KEY = 'fortuna_ad_doors';
const CSS = `
#doors { position: fixed; inset: 0; z-index: 2147482900; display: none; overflow: hidden; pointer-events: auto; }
#doors.on { display: block; }
#doors > div { position: absolute; top: 0; bottom: 0; width: 50.2%; background: #171b14 center / cover no-repeat; will-change: transform; }
#doors .dl { left: 0; background-position: right center; transform: translateX(-101%); }
#doors .dr { right: 0; background-position: left center; transform: translateX(101%); }
#doors > div::after { content: ""; position: absolute; top: 0; bottom: 0; width: 6vmin; pointer-events: none; }
#doors .dl::after { right: -6vmin; background: linear-gradient(90deg, rgba(0,0,0,.55), rgba(0,0,0,0)); }
#doors .dr::after { left: -6vmin; background: linear-gradient(270deg, rgba(0,0,0,.55), rgba(0,0,0,0)); }
#doors .sh { position: absolute; inset: 0; background: #000; opacity: 0; width: auto; }
#doors .sh::after, #doors .dt::after { display: none; }
#doors .dt { position: absolute; left: 50%; right: auto; top: auto; bottom: max(7%, calc(var(--sa-b, 0px) + 12px)); width: auto; transform: translateX(-50%); background: rgba(12,14,10,.82);
  border: 1px solid rgba(232,176,74,.45); color: #e9e6dc; font: 500 13px 'Golos Text', -apple-system, sans-serif; padding: 6px 14px; white-space: nowrap; display: none; }
#doors.wait .dt { display: block; }`;

export function createDoors() {
  const st = document.createElement('style'); st.textContent = CSS; if (document.head) document.head.appendChild(st); // (заглушка DOM стенда - без head/body)
  const el = document.createElement('div'); el.id = 'doors'; if (el.setAttribute) el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="sh"></div><div class="dl"></div><div class="dr"></div><div class="dt"></div>'; if (document.body) document.body.appendChild(el);
  const sh = el.querySelector('.sh'), L = el.querySelector('.dl'), R = el.querySelector('.dr'), T = el.querySelector('.dt');
  const url = (s, h) => `airdef/ui/doors/${s}_${h}.webp?v=20261109a`; // ?v= - версия модулей (поднимается при деплое)
  const look = (s) => { cur = s; L.style.backgroundImage = `url(${url(s, 'l')})`; R.style.backgroundImage = `url(${url(s, 'r')})`; };
  let pre = false, busy = false, cur = STY[0], held = null, failT = 0, leaving = false;
  // картинки - заранее, в простое меню (4 × 70-90 КБ): к первому нажатию «Начать» уже в кэше
  const preload = () => { if (pre || typeof Image !== 'function') return; pre = true; for (const s of STY) for (const h of ['l', 'r']) { const i = new Image(); i.decoding = 'async'; i.src = url(s, h); } };
  const RM = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const A = (e, kf, o) => e.animate(kf, { fill: 'forwards', ...o }).finished;
  const frame = () => new Promise((ok) => requestAnimationFrame(() => ok()));
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const api = { run, preload, carry, release, note, gate: null, get busy() { return busy || !!held; }, get held() { return held; } };
  // перезагрузка под новую карту: створки закрыты с прошлой страницы (held: { s - стиль, k - go | menu | online })
  try { const d = JSON.parse(sessionStorage.getItem(KEY) || 'null'); sessionStorage.removeItem(KEY); if (d && Date.now() - d.t < 60000 && STY.includes(d.s)) held = d; } catch (_) { /* нет хранилища */ }
  if (held && el.animate && !RM) {
    look(held.s); L.style.transform = R.style.transform = 'translateX(0)'; el.classList.add('on', 'wait'); note('');
    const hb = document.getElementById && document.getElementById('doorsBoot'); if (hb && hb.remove) hb.remove(); // замена заглушки из airdef.html - те же картинки на том же месте
    failT = setTimeout(() => { if (held) release(true); }, held.k === 'online' ? 20000 : 15000); // страховка: ничего не пришло - открыть
  } else if (held) { held = null; const hb = document.getElementById && document.getElementById('doorsBoot'); if (hb && hb.remove) hb.remove(); }
  function note(t) { if (T) T.textContent = t || tr('Загрузка…'); }
  // перед перезагрузкой страницы: створки закрыты - новая страница начнётся с них же
  // уход: страница перезагружается (fn вызвал location.replace) - створки на ней больше не открываем (ревью 2026-11-02: при медленном ответе сети они трогались
  // и показывали меню, потом новая страница снова начиналась с закрытых); не перезагрузилась за 10 с - открыть
  function carry(k) { if (!busy && !held) return; leaving = true; setTimeout(() => { if (leaving) { leaving = false; open().then(clean, clean); } }, 10000); try { sessionStorage.setItem(KEY, JSON.stringify({ s: cur, t: Date.now(), k })); } catch (_) { /* нет хранилища - без створок */ } }
  // расход: рывок замка, створки уезжают
  async function open() {
    el.classList.remove('wait');
    await Promise.all([
      A(L, [{ transform: 'translateX(0)' }, { transform: 'translateX(-0.8%)' }], { duration: 220, easing: 'ease-in-out' }),
      A(R, [{ transform: 'translateX(0)' }, { transform: 'translateX(0.8%)' }], { duration: 220, easing: 'ease-in-out' })]);
    A(sh, [{ opacity: 0.5 }, { opacity: 0 }], { duration: 1000, easing: 'ease-out' });
    await Promise.all([
      A(L, [{ transform: 'translateX(-0.8%)' }, { transform: 'translateX(-101%)' }], { duration: 1100, easing: 'cubic-bezier(.55,0,.35,1)' }),
      A(R, [{ transform: 'translateX(0.8%)' }, { transform: 'translateX(101%)' }], { duration: 1100, easing: 'cubic-bezier(.55,0,.35,1)' })]);
  }
  const clean = () => { el.classList.remove('on', 'wait'); L.style.transform = R.style.transform = ''; for (const x of [el, sh, L, R]) if (x.getAnimations) x.getAnimations().forEach((a) => a.cancel()); busy = false; };
  // створки закрыты с перезагрузки: fn - сразу, расход - когда карта догрузилась (gate, не дольше 8 с)
  async function fromHeld(fn) {
    held = null; clearTimeout(failT); busy = true;
    try { if (fn) fn(); } catch (e) { console.error(e); }
    try {
      if (leaving) return;
      await frame(); await frame(); await wait(380);
      for (let t = 0; t < 8000 && api.gate && !api.gate(); t += 200) await wait(200);
      if (leaving) return;
      await open();
    } catch (e) { console.error(e); } finally { if (!leaving) clean(); }
  }
  // открыть створки, закрытые с перезагрузки; any - и для онлайна (там их откроет вход в бой, это - лобби или страховка)
  function release(any = false) { if (held && (any || held.k !== 'online')) fromHeld(null); }
  // fn - смена экрана за закрытыми створками. Уже идут: кнопка нажата повторно - не делаем ничего; force (бой пришёл с сервера) - сразу
  async function run(fn, force = false) {
    if (held) { fromHeld(fn); return; }
    if (busy) { if (force) fn(); return; }
    if (RM || !el.animate || document.hidden || navigator.webdriver) { fn(); return; }
    busy = true; preload();
    let did = false; const go = () => { if (did) return; did = true; try { fn(); } catch (e) { console.error(e); } }; // экран меняется ровно один раз, даже если анимацию сорвали
    const safety = setTimeout(go, 2500); // вкладку свернули посреди хода створок (анимации и кадры стоят) - экран всё равно меняется: бой онлайна не ждёт
    look(STY[Math.floor(Math.random() * STY.length)]);
    el.classList.add('on');
    try {
      A(sh, [{ opacity: 0 }, { opacity: 0.5 }], { duration: 900, easing: 'ease-in' });
      await Promise.all([ // разгон мотора, ход, мягкий доход
        A(L, [{ transform: 'translateX(-101%)' }, { transform: 'translateX(-60%)', offset: 0.45 }, { transform: 'translateX(0)' }], { duration: 950, easing: 'cubic-bezier(.45,0,.75,1)' }),
        A(R, [{ transform: 'translateX(101%)' }, { transform: 'translateX(60%)', offset: 0.45 }, { transform: 'translateX(0)' }], { duration: 950, easing: 'cubic-bezier(.45,0,.75,1)' })]);
      A(el, [{ transform: 'translate(0,0)' }, { transform: 'translate(0,0.6vmin)' }, { transform: 'translate(0,-0.25vmin)' }, { transform: 'translate(0,0)' }], { duration: 260, easing: 'ease-out' }); // удар об уплотнитель
      A(L, [{ transform: 'translateX(0)' }, { transform: 'translateX(-0.4%)' }, { transform: 'translateX(0)' }], { duration: 240 });
      A(R, [{ transform: 'translateX(0)' }, { transform: 'translateX(0.4%)' }, { transform: 'translateX(0)' }], { duration: 240 });
      await frame(); go();
      if (leaving) return; // страница перезагружается - створки остаются закрытыми до её выгрузки
      await frame(); await frame(); await wait(380); // первые кадры нового экрана (сборка шейдеров) - за створками
      if (leaving) return;
      await open();
    } catch (e) { console.error(e); } finally { clearTimeout(safety); go(); if (!leaving) clean(); }
  }
  return api;
}
