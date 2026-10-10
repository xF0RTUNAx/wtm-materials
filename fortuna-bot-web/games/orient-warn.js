// Предупреждение перед боем на телефоне («Симулятор Летки», «Воздушное превосходство»): игры рассчитаны на горизонтальный
// экран. Окно показывается, если экран вертикальный и игрок ещё не нажал «Понятно» (запоминается в localStorage).
// Повернул устройство — окно закрывается само и бой начинается; «Понятно» — бой начинается как есть.
const KEY = 'fortuna_orient_ok';
let box = null;
export function orientGate(go, isTouch = matchMedia('(pointer: coarse)').matches) {
  let ok = false;
  try { ok = localStorage.getItem(KEY) === '1'; } catch (_) { /* приватный режим */ }
  const portrait = () => innerHeight > innerWidth;
  if (!isTouch || ok || !portrait()) { go(); return; }
  if (box) box.remove();
  box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(4,8,14,.88);'
    + 'padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom));font-family:-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff';
  box.innerHTML = `<div style="max-width:340px;width:100%;background:#111a26;border:1px solid rgba(251,146,60,.55);border-radius:16px;padding:20px 18px;text-align:center">
    <div style="font-size:46px;line-height:1;display:inline-block;animation:orw 1.6s ease-in-out infinite">📱</div>
    <p style="font-size:17px;font-weight:800;line-height:1.35;margin:14px 0 8px">Крайне рекомендуем установить горизонтальную ориентацию устройства перед началом игры!</p>
    <p style="font-size:13px;opacity:.75;margin:0 0 16px">Поверните телефон — бой начнётся сам. Кнопки и обзор рассчитаны на широкий экран.</p>
    <button type="button" data-a="ok" style="width:100%;padding:12px;border:0;border-radius:12px;background:linear-gradient(#fb923c,#ea580c);color:#fff;font-weight:800;font-size:15px">Понятно</button>
    <button type="button" data-a="back" style="width:100%;margin-top:8px;padding:10px;border:1px solid rgba(255,255,255,.2);border-radius:12px;background:none;color:#fff;font-size:14px">Назад</button>
  </div><style>@keyframes orw{0%,20%{transform:rotate(0)}50%,80%{transform:rotate(-90deg)}100%{transform:rotate(-90deg)}}</style>`;
  document.body.appendChild(box);
  const close = () => { removeEventListener('resize', check); if (box) { box.remove(); box = null; } };
  const check = () => { if (!portrait()) { close(); go(); } };
  addEventListener('resize', check);
  box.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]'); if (!a) return;
    if (a.dataset.a === 'ok') { try { localStorage.setItem(KEY, '1'); } catch (_) { /* нет */ } close(); go(); } else close();
  });
}
