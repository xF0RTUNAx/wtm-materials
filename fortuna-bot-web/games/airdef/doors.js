// Створки при входе в бой и выходе в меню (Mark 2026-11-01: «случайно одна из двух при каждом заходе и выходе»). Две половины —
// рендер Blender (стальные створки укрытия «07» и ворота ангара «42», текстуры Poly Haven CC0; прототипы v3) → ui/doors/<стиль>_l|r.webp.
// Створки съезжаются, бьются об уплотнитель, за закрытыми меняется экран (тяжёлая сборка боя — тоже за ними), рывок замка, расходятся.
// Без звука (Mark: ни записи, ни синтез для створок не подошли). Без анимации (reduce motion, скрытая вкладка, стенды в Chrome без окна) — сразу fn().
const STY = ['has', 'hangar'];
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
#doors .sh::after { display: none; }`;

export function createDoors() {
  const st = document.createElement('style'); st.textContent = CSS; if (document.head) document.head.appendChild(st); // (заглушка DOM стенда — без head/body)
  const el = document.createElement('div'); el.id = 'doors'; if (el.setAttribute) el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="sh"></div><div class="dl"></div><div class="dr"></div>'; if (document.body) document.body.appendChild(el);
  const sh = el.querySelector('.sh'), L = el.querySelector('.dl'), R = el.querySelector('.dr');
  const url = (s, h) => `airdef/ui/doors/${s}_${h}.webp?v=20261101a`; // ?v= — версия модулей (поднимается при деплое)
  let pre = false, busy = false;
  // картинки — заранее, в простое меню (4 × 70–90 КБ): к первому нажатию «Начать» уже в кэше
  const preload = () => { if (pre || typeof Image !== 'function') return; pre = true; for (const s of STY) for (const h of ['l', 'r']) { const i = new Image(); i.decoding = 'async'; i.src = url(s, h); } };
  const RM = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const A = (e, kf, o) => e.animate(kf, { fill: 'forwards', ...o }).finished;
  const frame = () => new Promise((ok) => requestAnimationFrame(() => ok()));
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  // fn — смена экрана за закрытыми створками. Уже идут: кнопка нажата повторно — не делаем ничего; force (бой пришёл с сервера) — сразу
  async function run(fn, force = false) {
    if (busy) { if (force) fn(); return; }
    if (RM || !el.animate || document.hidden || navigator.webdriver) { fn(); return; }
    busy = true; preload();
    let did = false; const go = () => { if (did) return; did = true; try { fn(); } catch (e) { console.error(e); } }; // экран меняется ровно один раз, даже если анимацию сорвали
    const safety = setTimeout(go, 2500); // вкладку свернули посреди хода створок (анимации и кадры стоят) — экран всё равно меняется: бой онлайна не ждёт
    const s = STY[Math.floor(Math.random() * STY.length)];
    L.style.backgroundImage = `url(${url(s, 'l')})`; R.style.backgroundImage = `url(${url(s, 'r')})`;
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
      await frame(); await frame(); await wait(380); // первые кадры нового экрана (сборка шейдеров) — за створками
      await Promise.all([ // рывок замка
        A(L, [{ transform: 'translateX(0)' }, { transform: 'translateX(-0.8%)' }], { duration: 220, easing: 'ease-in-out' }),
        A(R, [{ transform: 'translateX(0)' }, { transform: 'translateX(0.8%)' }], { duration: 220, easing: 'ease-in-out' })]);
      A(sh, [{ opacity: 0.5 }, { opacity: 0 }], { duration: 1000, easing: 'ease-out' });
      await Promise.all([
        A(L, [{ transform: 'translateX(-0.8%)' }, { transform: 'translateX(-101%)' }], { duration: 1100, easing: 'cubic-bezier(.55,0,.35,1)' }),
        A(R, [{ transform: 'translateX(0.8%)' }, { transform: 'translateX(101%)' }], { duration: 1100, easing: 'cubic-bezier(.55,0,.35,1)' })]);
    } catch (e) { console.error(e); } finally {
      clearTimeout(safety); go(); el.classList.remove('on'); for (const x of [el, sh, L, R]) if (x.getAnimations) x.getAnimations().forEach((a) => a.cancel()); busy = false;
    }
  }
  return { run, preload, get busy() { return busy; } };
}
