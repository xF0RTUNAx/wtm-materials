// Окно «Поддержка» (Mark 2026-11-18, макет «А» tools/airdef-mockups/support/index.html): новое обращение, «Мои обращения» (со счётчиком
// непрочитанных), переписка по обращению. Серверная функция Supabase airdef-support (через callFn из account.js: ключ сессии и повтор при 401 - там):
//   list → { tickets, unread, limits } · thread → { ticket, messages } · create / reply → { id, msg_id, uploads } · sent · close.
// Файлы: до 3 штук, каждый до 15 МБ; картинки сжимаются в браузере (canvas, длинная сторона ≤ 1920, webp 0,85), видео - как есть. Заранее подписанные
// ссылки сервера (uploads) - XMLHttpRequest PUT с прогрессом; сорвалась загрузка - «Повторить» (те же ссылки, потом sent).
// Снимок экрана боя - только если окно открыто из паузы в бою. Сведения об устройстве и версии уходят сами (поле meta, не показываются игроку).
// Тексты игрока и ответы поддержки - только через esc() / textContent. Без аккаунта игры - «Поддержка - только с аккаунтом игры» и вход.
// Входы: профиль (rating-ui.js), «Настройки» (menu.js), пауза в бою (main.js); число непрочитанных - красной отметкой на кнопках (.supn).
import { ico } from './icons.js?v=20261120a';
import { tr, trIf, LANG, LOCALE } from './i18n.js?v=20261120a';
import { gameAcc, callFn } from './account.js?v=20261120a';

const VER = (() => { try { return new URL(import.meta.url).searchParams.get('v') || ''; } catch (_) { return ''; } })();
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MB = 1048576, FRESH = 60000, NOTICE = 200;

// ── последние ошибки страницы: ловим с момента загрузки модуля (он грузится вместе с main.js); из текста вырезается всё, похожее на ключ ──
const ERRS = [];
const keep = (s) => { const t = String(s ?? '').replace(/[A-Za-z0-9_\-]{24,}/g, '…').replace(/\s+/g, ' ').trim().slice(0, 200); if (t) { ERRS.push(t); if (ERRS.length > 15) ERRS.shift(); } };
try {
  addEventListener('error', (e) => keep((e.message || 'error') + (e.filename ? ' @' + String(e.filename).split('/').pop().split('?')[0] + ':' + (e.lineno || 0) : '')));
  addEventListener('unhandledrejection', (e) => { const r = e.reason; keep('promise: ' + (r && r.message ? r.message : r)); });
} catch (_) { /* стенд без window */ }

const ACCEPT = 'image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime';
const IS_IMG = (f) => /^image\/(png|jpeg|webp)$/.test(f.type) || (!f.type && /\.(png|jpe?g|webp)$/i.test(f.name));
const IS_VID = (f) => /^video\/(mp4|webm|quicktime)$/.test(f.type) || (!f.type && /\.(mp4|webm|mov)$/i.test(f.name));
const toBlob = (c, type, q) => new Promise((r) => { try { c.toBlob((b) => r(b), type, q); } catch (_) { r(null); } });
const loadImg = (file) => new Promise((ok, no) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); ok(im); }; im.onerror = () => { URL.revokeObjectURL(u); no(new Error('img')); }; im.src = u; });

// холст → webp 0,85 (нет кодера webp - браузер отдаёт png: тогда jpeg на белом фоне)
async function packCanvas(c, base) {
  let b = await toBlob(c, 'image/webp', 0.85), ext = 'webp';
  if (!b || b.type !== 'image/webp') {
    const x = c.getContext('2d'); x.globalCompositeOperation = 'destination-over'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    b = await toBlob(c, 'image/jpeg', 0.85); ext = 'jpg';
  }
  if (!b) throw new Error('blob');
  return { name: base + '.' + ext, size: b.size, type: b.type, blob: b };
}
// картинка игрока: длинная сторона ≤ 1920
async function packImage(file) {
  let src, w, h;
  try { src = await createImageBitmap(file); w = src.width; h = src.height; } catch (_) { src = await loadImg(file); w = src.naturalWidth; h = src.naturalHeight; }
  const k = Math.min(1, 1920 / Math.max(w, h)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); if (src.close) src.close();
  return packCanvas(c, String(file.name || 'image').replace(/\.[^.]+$/, '').slice(0, 60) || 'image');
}

const CSS = `
#supWin { position: fixed; inset: 0; z-index: 70; display: none; align-items: center; justify-content: center; box-sizing: border-box; background: rgba(8,11,7,.72); color: #ece8dc; font: 400 14px/1.4 'Golos Text', -apple-system, sans-serif;
  padding: calc(12px + var(--sa-t, 0px) + var(--tg-t, 0px)) max(12px, var(--sa-r, 0px)) max(12px, var(--sa-b, 0px)) max(12px, var(--sa-l, 0px)); --gold: #e8b04a; --gold2: #f3c96f; --ink: #ece8dc; --dim: #c2c7b2; --mute: #8d9580; }
#supWin.on { display: flex; } #supWin .sbox { display: contents; }
#supWin *, #supWin *::before, #supWin *::after { box-sizing: border-box; }
#supWin button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-align: left; }
#supWin button:focus-visible, #supWin textarea:focus-visible { outline: 2px solid var(--gold2); outline-offset: 1px; }
#supWin .ic { width: 1em; height: 1em; fill: currentColor; flex: none; display: inline-block; vertical-align: -0.15em; }
/* окно - рамка из набора «Табло аэродрома» (ui/rating/r_*.webp, как профиль) */
#supWin .swin { width: min(780px, 100%); height: min(560px, 100%); min-width: 0; display: flex; flex-direction: column; border-style: solid; border-color: transparent; border-width: 16px; border-image: url(airdef/ui/rating/r_win.webp) 66 fill / 22px stretch; }
#supWin .swin.gst { height: auto; max-height: 100%; width: min(520px, 100%); }
#supWin .hd { flex: none; display: flex; align-items: center; gap: 8px; margin: -4px -2px 8px; min-width: 0; }
#supWin .hd > b { font: 500 19px 'Oswald', 'Arial Narrow', sans-serif; letter-spacing: .04em; white-space: nowrap; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
#supWin .hd .tabs { display: flex; gap: 4px; margin-left: 10px; }
#supWin .hd .x, #supWin .hd .bk { flex: none; width: 30px; height: 30px; display: grid; place-items: center; text-align: center; border: 0 solid transparent; border-image: url(airdef/ui/rating/r_ibtn.webp) 30 fill / 10px stretch; color: var(--gold2); font: 600 14px/1 'Oswald'; line-height: 1; padding: 0 0 1px; } /* рамка - картинкой поверх, без ширины бордюра: значок по центру всей кнопки (Mark 2026-11-18) */
#supWin .hd .x .ic, #supWin .hd .bk .ic { display: block; vertical-align: 0; }
#supWin .hd .x { margin-left: auto; } #supWin .hd .bk .ic { font-size: 14px; }
#supWin .hd .x:active, #supWin .hd .bk:active { border-image-source: url(airdef/ui/rating/r_ibtn_down.webp); }
#supWin .tab { position: relative; height: 28px; padding: 0 12px; display: grid; place-items: center; text-align: center; border-style: solid; border-color: transparent; border-width: 10px; border-image: url(airdef/ui/rating/r_seg_off.webp) 30 fill / 10px stretch; font: 500 13px/1 'Oswald'; color: var(--dim); white-space: nowrap; }
#supWin .tab.on { border-image-source: url(airdef/ui/rating/r_seg_on.webp); color: #1c1708; }
/* красная отметка непрочитанных: на вкладке - в углу, на кнопках других окон - в строке (пустая не видна) */
.supn { display: inline-grid; place-items: center; min-width: 18px; height: 18px; margin-left: 7px; padding: 0 5px; background: #c0392b; color: #fff; border-radius: 9px; font: 600 11px/1 'Golos Text', sans-serif; vertical-align: middle; letter-spacing: 0; text-transform: none; }
.supn:empty { display: none; }
#supWin .tab .supn { position: absolute; top: -14px; right: -14px; margin: 0; box-shadow: 0 0 0 2px #1a1c16; }
#supWin .sbody { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; touch-action: pan-y; overscroll-behavior: contain; padding: 0 2px; }
#supWin .lbl { flex: none; font: 500 10px 'Oswald'; letter-spacing: .14em; text-transform: uppercase; color: var(--mute); margin: 0 0 4px; }
#supWin .topics { flex: none; display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 6px; }
#supWin .tp { height: 26px; padding: 0 9px; display: grid; place-items: center; text-align: center; border-style: solid; border-color: transparent; border-width: 8px; border-image: url(airdef/ui/rating/r_seg_off.webp) 30 fill / 8px stretch; font: 500 12px/1 'Oswald'; color: var(--dim); white-space: nowrap; }
#supWin .tp.on { border-image-source: url(airdef/ui/rating/r_seg_on.webp); color: #1c1708; } #supWin .tp:disabled { cursor: default; }
#supWin textarea.well { display: block; width: 100%; resize: none; background: none; color: var(--ink); border-style: solid; border-color: transparent; border-width: 12px; border-image: url(airdef/ui/rating/r_well.webp) 36 fill / 12px stretch; padding: 0; margin: 0; font: 13px/1.4 'Golos Text', sans-serif; -webkit-user-select: text; user-select: text; border-radius: 0; -webkit-appearance: none; appearance: none; }
#supWin textarea.well::placeholder { color: var(--mute); }
#supWin textarea.txt { flex: 1 1 96px; min-height: 64px; }
#supWin .cnt { flex: none; text-align: right; font: 11px 'Golos Text'; color: var(--mute); min-height: 15px; } #supWin .cnt.low { color: #e8a24a; }
#supWin .att { flex: none; display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; align-items: stretch; }
#supWin .att .f { position: relative; width: 74px; height: 46px; background: #1b1e18; border: 1px solid #4a4636; overflow: hidden; }
#supWin .att .f img { display: block; width: 100%; height: 100%; object-fit: cover; }
#supWin .att .f small { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,.72); font: 500 9.5px 'Oswald'; text-align: center; padding: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#supWin .att .f.vid { width: 150px; display: flex; align-items: center; padding: 0 22px 0 8px; font: 500 11px/1.15 'Oswald'; color: var(--dim); }
#supWin .att .f.vid span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } #supWin .att .f.vid b { color: var(--gold2); font-weight: 500; display: block; }
#supWin .att .f .rm { position: absolute; top: 0; right: 0; width: 20px; height: 20px; display: grid; place-items: center; text-align: center; background: rgba(0,0,0,.65); color: var(--gold2); font: 600 13px/1 'Golos Text'; }
#supWin .att .f.busy { display: grid; place-items: center; font: 500 10px 'Oswald'; color: var(--dim); }
#supWin .att .add { width: 74px; min-height: 46px; display: grid; place-items: center; text-align: center; border: 1px dashed #6c6650; color: var(--gold2); font: 500 11px/1.15 'Oswald'; }
#supWin .hint { flex: none; font: 11px/1.35 'Golos Text'; color: var(--mute); margin-top: 4px; }
#supWin .err { flex: none; margin-top: 4px; font: 12px/1.35 'Golos Text'; color: #ffb4a6; } #supWin .err:empty { display: none; }
#supWin .err .lnk { margin-left: 8px; color: var(--gold2); text-decoration: underline; font: inherit; display: inline; }
#supWin .note { flex: none; margin-bottom: 4px; font: 12px/1.35 'Golos Text'; color: #9fe0aa; }
#supWin .foot { flex: none; display: flex; align-items: center; gap: 10px; margin-top: 6px; padding: 0 2px; }
#supWin .chk { display: inline-flex; align-items: center; gap: 7px; font: 500 12.5px 'Oswald'; color: var(--ink); cursor: pointer; min-width: 0; }
#supWin .chk input { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; }
#supWin .chk i { flex: none; width: 17px; height: 17px; border: 1px solid #6c6650; background: rgba(0,0,0,.35); display: grid; place-items: center; color: #1c1708; font: 700 12px/1 'Golos Text'; font-style: normal; }
#supWin .chk input:checked + i { background: var(--gold); border-color: var(--gold); } #supWin .chk input:checked + i::after { content: '✓'; }
#supWin .chk input:focus-visible + i { outline: 2px solid var(--gold2); outline-offset: 1px; } #supWin .chk.off { opacity: .5; cursor: default; }
#supWin .grow { flex: 1 1 auto; }
#supWin .btn { flex: none; width: auto; margin: 0; background: none; border-radius: 0; box-shadow: none; height: 38px; min-width: 120px; padding: 0 10px; display: grid; place-items: center; text-align: center; border-style: solid; border-color: transparent; border-width: 12px; border-image: url(airdef/ui/rating/r_btn.webp) 36 fill / 12px stretch; font: 600 15px/1 'Oswald'; letter-spacing: .06em; color: #1c1708; text-transform: uppercase; white-space: nowrap; }
#supWin .btn:active { border-image-source: url(airdef/ui/rating/r_btn_down.webp); }
#supWin .btn.alt { border-image-source: url(airdef/ui/rating/r_btn_alt.webp); color: var(--gold2); } #supWin .btn.alt:active { border-image-source: url(airdef/ui/rating/r_btn_alt_down.webp); }
#supWin .btn:disabled { filter: grayscale(.55) brightness(.7); cursor: default; }
#supWin .btn.sm { min-width: 0; width: auto; height: 30px; border-width: 10px; font-size: 12px; padding: 0 4px; }
#supWin .foot .btn { min-width: 160px; }
/* список обращений */
#supWin .list { display: flex; flex-direction: column; gap: 4px; }
#supWin .row { display: grid; grid-template-columns: 54px minmax(0, 1fr) auto 62px; align-items: center; gap: 8px; width: 100%; min-height: 46px; padding: 0 4px; border-style: solid; border-color: transparent; border-width: 12px; border-image: url(airdef/ui/rating/r_sec.webp) 36 fill / 12px stretch; color: var(--ink); }
#supWin .row.me { border-image-source: url(airdef/ui/rating/r_row_me.webp); color: #1c1708; }
#supWin .row .no { font: 500 13px 'Oswald'; color: var(--mute); } #supWin .row .t { min-width: 0; } #supWin .row .t b { display: block; font: 500 14px/1.15 'Oswald'; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#supWin .row .t small { display: block; font: 11px 'Golos Text'; color: var(--mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } #supWin .row .dt { font: 11px 'Golos Text'; color: var(--mute); text-align: right; }
#supWin .row.me .t small, #supWin .row.me .no, #supWin .row.me .dt { color: #5a4a1e; }
#supWin .st { display: inline-grid; place-items: center; height: 20px; padding: 0 7px; font: 600 10px/1 'Oswald'; letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; }
#supWin .st.ans { background: var(--gold); color: #1c1708; } #supWin .st.new { background: #2f4f6a; color: #cfe6ff; } #supWin .st.cl { background: #3a3a32; color: #a8a894; }
#supWin .row.me .st.ans { background: #1c1708; color: var(--gold2); }
#supWin .empty { padding: 18px 8px; text-align: center; color: var(--dim); font-size: 13px; } #supWin .empty .btn { margin: 10px auto 0; }
/* переписка */
#supWin .thread { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; -webkit-overflow-scrolling: touch; touch-action: pan-y; overscroll-behavior: contain; padding: 2px; }
#supWin .msg { flex: none; max-width: 82%; border-style: solid; border-color: transparent; border-width: 12px; border-image: url(airdef/ui/rating/r_sec.webp) 36 fill / 12px stretch; font: 12.5px/1.4 'Golos Text'; -webkit-user-select: text; user-select: text; }
#supWin .msg.sup { align-self: flex-start; border-image-source: url(airdef/ui/rating/r_row_me.webp); color: #1c1708; } #supWin .msg.me { align-self: flex-end; }
#supWin .msg .who { font: 500 10.5px 'Oswald'; letter-spacing: .12em; text-transform: uppercase; color: #5a4a1e; margin-bottom: 2px; } #supWin .msg.me .who { color: var(--mute); }
#supWin .msg .tx { white-space: pre-wrap; overflow-wrap: anywhere; } #supWin .msg .clip { margin-top: 4px; font: 500 11px/1.3 'Oswald'; color: var(--gold2); overflow-wrap: anywhere; } #supWin .msg.sup .clip { color: #5a4a1e; }
#supWin .reply { flex: none; display: flex; gap: 6px; align-items: flex-end; margin-top: 6px; }
#supWin .reply textarea.well { flex: 1 1 auto; width: auto; height: 38px; transition: height .12s; } #supWin .reply textarea.well:focus { height: 76px; }
#supWin .reply .btn { min-width: 110px; }
#supWin .cl { flex: none; margin-top: 6px; text-align: center; color: var(--mute); font: 12px 'Golos Text'; }
#supWin .acts { display: flex; gap: 6px; margin-left: 8px; flex: none; } #supWin .hd .st { flex: none; }
#supWin .hd .btn.sm { margin-left: auto; } #supWin .hd .btn.sm + .x { margin-left: 0; }
#supWin .gmsg { text-align: center; padding: 14px 6px 8px; font-size: 14px; color: var(--ink); } #supWin .gmsg .btn { margin: 12px auto 0; }
/* телефон горизонтально: рамка тоньше, окно во всю высоту */
@media (max-height: 500px) {
  #supWin .swin { border-width: 11px; border-image-width: 18px; height: 100%; width: min(780px, 100%); } #supWin .swin.gst { height: auto; }
  #supWin .hd { margin: -3px -2px 6px; } #supWin .hd > b { font-size: 17px; } #supWin .att .f, #supWin .att .add { height: 40px; min-height: 40px; }
  #supWin textarea.txt { min-height: 48px; } #supWin .btn { height: 34px; border-width: 11px; } #supWin .foot { margin-top: 4px; } #supWin .tp { height: 24px; }
}
@media (max-width: 560px) { #supWin .hd > b { font-size: 16px; } #supWin .row { grid-template-columns: 44px minmax(0, 1fr) auto; } #supWin .row .dt { display: none; } #supWin .msg { max-width: 94%; } }
`;

export function createSupport(C) {
  const style = document.createElement('style'); style.textContent = CSS; if (document.head) document.head.appendChild(style); // (заглушка DOM стенда - без head/body)
  const root = document.createElement('div'); root.id = 'supWin'; root.setAttribute && root.setAttribute('role', 'dialog'); root.setAttribute && root.setAttribute('aria-modal', 'true');
  const box = document.createElement('div'); box.className = 'sbox'; root.appendChild && root.appendChild(box); // box - перерисовывается, поле выбора файла и сама подложка - нет
  const fin = document.createElement('input'); fin.type = 'file'; fin.multiple = true; fin.accept = ACCEPT; fin.style.display = 'none'; root.appendChild && root.appendChild(fin);
  if (document.body && document.body.appendChild) document.body.appendChild(root);
  const q = (s) => (box.querySelector ? box.querySelector(s) : null);

  const newForm = () => ({ text: '', files: [] });
  // view: new | list | thread | guest; N - новое обращение, R - ответ в открытой переписке; shot - снимок боя; pend - создано, но файлы не доехали (Повторить)
  const S = { view: 'new', topic: 'bug', N: newForm(), R: newForm(), tickets: null, unread: 0, lim: { maxFiles: 3, maxFileMB: 15, maxText: 2000 }, listAt: 0, lb: false, lerr: '', acc: '',
    tid: '', th: null, therr: '', thBusy: false, shot: null, shotOn: true, shotBusy: false, inBattle: false, packing: 0, sending: false, pct: 0, pend: null, err: '', note: '', closing: false };
  const topicName = { bug: () => tr('Ошибка'), account: () => tr('Аккаунт и прогресс'), purchase: () => tr('Покупки'), player: () => tr('Жалоба на игрока'), idea: () => tr('Идея') };
  const form = (k) => (k === 'reply' ? S.R : S.N);
  const shotCount = () => (S.shot && S.shotOn ? 1 : 0);
  const total = (k) => form(k).files.length + (k === 'reply' ? 0 : shotCount());
  const locked = (k) => !!S.pend && S.pend.kind === k;
  const kf = (v) => String(v).replace('.', LANG === 'en' ? '.' : ',');
  const fmtSize = (b) => (b >= MB ? kf((b / MB).toFixed(1)) + ' ' + tr('МБ') : Math.max(1, Math.round(b / 1024)) + ' ' + tr('КБ'));
  const dShort = (iso) => { const d = new Date(iso); if (isNaN(d)) return ''; if (d.toDateString() === new Date().toDateString()) return tr('сегодня'); return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }).replace(/\.$/, ''); };
  const dFull = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }).replace(/\.$/, '') + ', ' + d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }); };
  const stName = (s) => (s === 'closed' ? tr('Закрыто') : s === 'answered' ? tr('Есть ответ') : tr('Отправлено'));
  const stCls = (s) => (s === 'closed' ? 'cl' : s === 'answered' ? 'ans' : 'new');
  const errText = (e) => (e && e.status === 0 ? tr('Нет связи с сайтом') : e && e.status === 400 ? tr('Проверьте текст и файлы') : (e && trIf(e.message)) || tr('Ошибка сервера'));
  const call = (b) => { const g = gameAcc(); if (!g) return Promise.reject(Object.assign(new Error(tr('Поддержка - только с аккаунтом игры')), { status: 401 })); return callFn('airdef-support', { player_id: g.id, ...b }); };

  // ── отметка непрочитанных на кнопках других окон ──
  function paintBadges() {
    if (!document.querySelectorAll) return;
    for (const el of document.querySelectorAll('.supn')) { const t = S.unread > 0 ? String(S.unread) : ''; if (el.textContent !== t) el.textContent = t; }
  }
  const resetFor = (g) => { // сменился аккаунт: чужие обращения и тексты не показываем
    const id = g ? g.id : ''; if (S.acc === id) return; S.acc = id; S.tickets = null; S.unread = 0; S.th = null; S.tid = ''; S.pend = null; S.err = ''; dropFiles(S.N); dropFiles(S.R); S.N = newForm(); S.R = newForm(); dropShot(); S.listAt = 0; paintBadges();
  };
  function dropFiles(F) { for (const f of F.files) if (f.url) URL.revokeObjectURL(f.url); F.files = []; }
  function dropShot() { if (S.shot && S.shot.url) URL.revokeObjectURL(S.shot.url); S.shot = null; S.shotOn = true; }
  async function loadList(show) {
    const g = gameAcc(); if (!g) { resetFor(null); return; }
    resetFor(g); if (S.lb) return; S.lb = true; S.listAt = Date.now(); if (show) S.lerr = '';
    try {
      const d = await call({ action: 'list' }); if (!gameAcc() || gameAcc().id !== g.id) return;
      S.tickets = Array.isArray(d.tickets) ? d.tickets : []; S.unread = Math.max(0, +d.unread || 0); S.lerr = '';
      if (d.limits) S.lim = { maxFiles: +d.limits.maxFiles || 3, maxFileMB: +d.limits.maxFileMB || 15, maxText: +d.limits.maxText || 2000 };
    } catch (e) { S.lerr = errText(e); } finally { S.lb = false; paintBadges(); if (root.classList.contains('on') && S.view === 'list') draw(); }
  }

  // ── снимок боя: кадр перерисовывается и копируется в холст в той же задаче (буфер WebGL после кадра очищается) ──
  async function takeShot() {
    S.shotBusy = true; let c = null;
    try {
      const R = C.renderer, cv = R && R.domElement;
      if (cv && cv.width > 0) {
        if (C.pipe) C.pipe.render(C.scene, C.camera, performance.now() / 1000); else R.render(C.scene, C.camera);
        const k = Math.min(1, 1920 / Math.max(cv.width, cv.height)); c = document.createElement('canvas'); c.width = Math.max(1, Math.round(cv.width * k)); c.height = Math.max(1, Math.round(cv.height * k));
        const x = c.getContext('2d'); x.drawImage(cv, 0, 0, c.width, c.height);
        const hud = document.getElementById('hudc'); if (hud && hud.width > 0) x.drawImage(hud, 0, 0, c.width, c.height); // приборы поверх кадра
      }
    } catch (_) { c = null; }
    let it = null; if (c) { try { it = await packCanvas(c, 'screenshot'); it.url = URL.createObjectURL(it.blob); } catch (_) { it = null; } }
    S.shotBusy = false; if (!S.inBattle) { if (it && it.url) URL.revokeObjectURL(it.url); return; } // окно закрыли и открыли не из паузы, пока кадр жал
    S.shot = it; S.shotOn = !!it && S.N.files.length < S.lim.maxFiles; if (root.classList.contains('on') && S.view === 'new') draw();
  }

  // ── что уходит само ──
  const lsGet = (k) => { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } };
  function collect() {
    const nav = typeof navigator !== 'undefined' ? navigator : {}, N = C.netc, st = C.setup || {};
    const m = { ver: VER, ua: String(nav.userAgent || '').slice(0, 200), lang: LANG, gfx: lsGet('fortuna_airdef_gfx') || C.gfxKey || '', fps: String(C.fpsCap), scr: [Math.round(innerWidth), Math.round(innerHeight)], dpr: Math.round((devicePixelRatio || 1) * 100) / 100,
      state: C.state, mode: (N && N.battle && N.battle.mode) || st.game || '', map: C.MAP || '', side: st.side || '', errs: ERRS.slice() };
    const team = N && N.myTeam ? N.myTeam() : null; if (team) m.team = team;
    if (N && N.room && N.room.code) m.room = String(N.room.code).slice(0, 16);
    return m;
  }

  // ── файлы ──
  async function addFiles(kind, files) {
    const F = form(kind), lim = S.lim, notes = []; S.err = '';
    for (const f of files) {
      if (total(kind) >= lim.maxFiles) { notes.push(tr('Можно приложить не больше {0} файлов', [lim.maxFiles])); break; }
      const img = IS_IMG(f), vid = IS_VID(f);
      if (!img && !vid) { notes.push(tr('Файл «{0}» не подходит: только картинки (png, jpg, webp) и видео (mp4, webm, mov)', [f.name])); continue; }
      if ((vid && f.size > lim.maxFileMB * MB) || (img && f.size > 60 * MB)) { notes.push(tr('Файл «{0}» больше {1} МБ', [f.name, lim.maxFileMB])); continue; }
      S.packing++; draw();
      try {
        const it = vid ? { name: f.name || 'video', size: f.size, type: f.type || 'video/mp4', blob: f } : await packImage(f);
        if (it.size > lim.maxFileMB * MB) notes.push(tr('Файл «{0}» больше {1} МБ', [f.name, lim.maxFileMB]));
        else { if (!vid) it.url = URL.createObjectURL(it.blob); F.files.push(it); }
      } catch (_) { notes.push(tr('Не удалось обработать файл «{0}»', [f.name])); } finally { S.packing--; }
    }
    S.err = notes.join(' '); draw();
  }
  let addTo = 'new';
  fin.addEventListener('change', () => { const fs = [...(fin.files || [])]; fin.value = ''; if (fs.length) addFiles(addTo, fs); });

  // ── отправка ──
  function put(up, blob, onp) {
    return new Promise((ok, no) => {
      if (/^mock:/.test(up.url)) { ok(); return; } // ?rmock=1: загрузки нет
      const x = new XMLHttpRequest(); x.open(up.method || 'PUT', up.url);
      for (const [k, v] of Object.entries(up.headers || {})) x.setRequestHeader(k, v);
      x.upload.onprogress = (e) => { if (e.lengthComputable) onp(e.loaded / e.total); };
      x.onload = () => (x.status >= 200 && x.status < 300 ? ok() : no(Object.assign(new Error('http ' + x.status), { http: x.status }))); x.onerror = x.ontimeout = x.onabort = () => no(new Error('net'));
      x.send(blob);
    });
  }
  const meta1 = (f) => ({ name: f.name, size: f.size, type: f.type });
  function sendLabel(k) { return S.sending ? tr('Отправка…') + (S.pct > 0 ? ' ' + S.pct + '%' : '') : locked(k) ? tr('Повторить') : k === 'reply' ? tr('Ответить') : tr('Отправить'); }
  const canSend = (k) => !S.sending && !S.packing && (locked(k) || !!form(k).text.trim());
  function paintSend() {
    const b = q('[data-a="send"]'); if (!b) return;
    const k = S.view === 'thread' ? 'reply' : 'new', t = sendLabel(k); if (b.textContent !== t) b.textContent = t; b.disabled = !canSend(k);
  }
  // «Не отправлять» / ссылка больше не годится: незагруженное сообщение (и черновик обращения) на сервере - прочь, лимит не съедается
  function dropPend() { const P = S.pend; S.pend = null; if (P && P.id && P.msg) call({ action: 'cancel', id: P.id, msg_id: P.msg }).catch(() => {}); }
  async function send(kind) {
    if (S.sending || S.packing || !gameAcc()) return;
    const F = form(kind);
    if (locked(kind)) { finish(); return; }
    const text = F.text.trim(); if (!text) return;
    const list = [...(kind === 'new' && S.shot && S.shotOn ? [S.shot] : []), ...F.files];
    S.sending = true; S.pct = 0; S.err = ''; S.note = ''; draw();
    try {
      const d = kind === 'new' ? await call({ action: 'create', topic: S.topic, body: text, meta: collect(), files: list.map(meta1) }) : await call({ action: 'reply', id: S.tid, body: text, files: list.map(meta1) });
      S.pend = { kind, id: Number(kind === 'new' ? d.id : S.tid), msg: Number(d.msg_id), ups: d.uploads || [], list, done: [] };
    } catch (e) { S.sending = false; S.err = errText(e); draw(); return; }
    finish();
  }
  async function finish() {
    const P = S.pend; if (!P) return;
    S.sending = true; S.pct = 0; S.err = ''; draw();
    try {
      const tot = P.list.reduce((a, f) => a + f.size, 0) || 1; let base = 0;
      if (P.ups.length < P.list.length) throw Object.assign(new Error('uploads'), { status: 400 });
      for (let i = 0; i < P.list.length; i++) {
        const f = P.list[i];
        if (!P.done[i]) await put(P.ups[i], f.blob, (p) => { S.pct = Math.min(99, Math.round(((base + p * f.size) / tot) * 100)); paintSend(); });
        P.done[i] = true; base += f.size;
      }
      await call({ action: 'sent', id: P.id, msg_id: P.msg });
    } catch (e) {
      S.sending = false;
      if (e && e.http === 415) { S.err = tr('Файл не подошёл: только картинки и видео'); dropPend(); } // проверка содержимого на сервере - повтор бесполезен
      else if (e && (e.http === 403 || e.http === 400)) { S.err = tr('Время на загрузку вышло - отправьте ещё раз'); dropPend(); }
      else S.err = e && e.status != null ? errText(e) : tr('Не удалось загрузить файлы. Проверьте связь и нажмите «Повторить»');
      draw(); return;
    }
    // готово: форма очищена, дальше - переписка
    S.sending = false; S.pend = null; S.err = '';
    if (P.kind === 'new') { dropFiles(S.N); S.N = newForm(); dropShot(); S.inBattle = false; S.note = tr('Обращение отправлено'); } else { dropFiles(S.R); S.R = newForm(); S.note = tr('Ответ отправлен'); }
    S.listAt = 0; loadList(); openThread(P.id, true);
  }
  async function openThread(id, keepNote) {
    S.view = 'thread'; S.tid = Number(id); S.th = null; S.therr = ''; S.thBusy = true; S.closing = false; if (!keepNote) S.note = ''; if (S.R.tid !== S.tid) { dropFiles(S.R); S.R = newForm(); S.R.tid = S.tid; } draw();
    try {
      const d = await call({ action: 'thread', id: Number(id) }); if (S.tid !== Number(id)) return;
      S.th = d; const t = (S.tickets || []).find((x) => Number(x.id) === Number(id)); if (t && t.unread) { t.unread = false; S.unread = Math.max(0, S.unread - 1); paintBadges(); }
    } catch (e) { if (S.tid !== Number(id)) return; S.therr = errText(e); } finally { if (S.tid === Number(id)) { S.thBusy = false; if (S.view === 'thread') draw(); } }
  }
  async function closeTicket() {
    if (!S.closing) { S.closing = true; draw(); return; }
    S.closing = false; S.err = '';
    try { await call({ action: 'close', id: S.tid }); if (S.th && S.th.ticket) S.th.ticket.status = 'closed'; const t = (S.tickets || []).find((x) => Number(x.id) === S.tid); if (t) t.status = 'closed'; S.listAt = 0; loadList(); }
    catch (e) { S.err = errText(e); }
    draw();
  }

  // ── разметка ──
  const tabs = () => `<div class="hd"><b>${tr('Поддержка')}</b><div class="tabs"><button class="tab${S.view === 'new' ? ' on' : ''}" data-a="tab-new">${tr('Новое обращение')}</button><button class="tab${S.view === 'list' ? ' on' : ''}" data-a="tab-list">${tr('Мои обращения')}<span class="supn">${S.unread > 0 ? S.unread : ''}</span></button></div><button class="x" data-a="close" aria-label="${tr('Закрыть')}" title="${tr('Закрыть')}">✕</button></div>`;
  function attHtml(kind) {
    const F = form(kind), lk = locked(kind), rm = (a, i) => (lk ? '' : `<button type="button" class="rm" data-a="${a}" data-i="${i}" aria-label="${tr('Убрать')}" title="${tr('Убрать')}">×</button>`);
    let h = '';
    if (kind === 'new' && S.shot && S.shotOn) h += `<div class="f"><img src="${esc(S.shot.url)}" alt=""><small>${tr('снимок')} · ${fmtSize(S.shot.size)}</small>${rm('rmshot', 0)}</div>`;
    F.files.forEach((f, i) => { h += f.url ? `<div class="f"><img src="${esc(f.url)}" alt=""><small>${fmtSize(f.size)}</small>${rm('rmf', i)}</div>` : `<div class="f vid"><span>▶ ${esc(f.name)}<b>${fmtSize(f.size)}</b></span>${rm('rmf', i)}</div>`; });
    if (S.packing) h += `<div class="f busy">${tr('Готовим…')}</div>`;
    if (kind === 'new' && !lk && total(kind) + S.packing < S.lim.maxFiles) h += `<button type="button" class="add" data-a="addf" data-k="${kind}">${tr('+ Файл')}<br>${tr('фото / видео')}</button>`;
    return h ? `<div class="att">${h}</div>` : '';
  }
  const errHtml = () => `<div class="err" role="alert">${esc(S.err)}${S.pend && !S.sending ? `<button type="button" class="lnk" data-a="drop">${tr('Не отправлять')}</button>` : ''}</div>`;
  function viewNew() {
    const F = S.N, lk = locked('new'), left = S.lim.maxText - F.text.length;
    const topics = Object.keys(topicName).map((k) => `<button type="button" class="tp${S.topic === k ? ' on' : ''}" data-a="topic" data-k="${k}"${lk ? ' disabled' : ''}>${esc(topicName[k]())}</button>`).join('');
    const chk = S.shot ? `<label class="chk${!S.shotOn && S.N.files.length >= S.lim.maxFiles ? ' off' : ''}"><input type="checkbox" data-a="shot"${S.shotOn ? ' checked' : ''}${(!S.shotOn && S.N.files.length >= S.lim.maxFiles) || lk ? ' disabled' : ''}><i></i>${tr('Снимок экрана боя')}</label>` : '';
    return `${tabs()}<div class="sbody"><div class="lbl">${tr('Тема')}</div><div class="topics">${topics}</div>
      <textarea class="well txt" data-f="new" maxlength="${S.lim.maxText}" placeholder="${esc(tr('Опишите, что случилось: что делали, что ожидали и что получилось'))}"${lk ? ' readonly' : ''}>${esc(F.text)}</textarea>
      <div class="cnt${left < 50 ? ' low' : ''}" data-r="cnt">${left < NOTICE ? tr('Осталось знаков: {0}', [Math.max(0, left)]) : ''}</div>
      ${attHtml('new')}<div class="hint">${tr('До {0} файлов, каждый до {1} МБ · видео по мобильной сети тратит трафик', [S.lim.maxFiles, S.lim.maxFileMB])}</div>${errHtml()}</div>
      <div class="foot">${chk}<span class="grow"></span><button type="button" class="btn" data-a="send"${canSend('new') ? '' : ' disabled'}>${sendLabel('new')}</button></div>`;
  }
  function viewList() {
    let h;
    if (!S.tickets) h = S.lerr ? `<div class="empty">${esc(S.lerr)}<button type="button" class="btn alt" data-a="retry">${tr('Повторить')}</button></div>` : `<div class="empty">${tr('Загружаем…')}</div>`;
    else if (!S.tickets.length) h = `<div class="empty">${tr('Обращений пока нет')}</div>`;
    else h = `<div class="list">${S.tickets.map((t) => `<button type="button" class="row${t.unread ? ' me' : ''}" data-a="open" data-id="${esc(t.id)}"><span class="no">№ ${esc(t.id)}</span><span class="t"><b>${esc(t.title)}</b><small>${esc((topicName[t.topic] || (() => t.topic))())}${t.files ? ' · ' + tr('файлов: {0}', [t.files]) : ''}</small></span><span class="st ${stCls(t.status)}">${stName(t.status)}</span><span class="dt">${esc(dShort(t.updated_at || t.created_at))}</span></button>`).join('')}</div>${S.lerr ? `<div class="err">${esc(S.lerr)}</div>` : ''}`;
    return `${tabs()}<div class="sbody">${h}</div>`;
  }
  function viewThread() {
    const T = S.th, t = T && T.ticket, id = esc(S.tid);
    const head = `<div class="hd"><button type="button" class="bk" data-a="back" aria-label="${tr('Назад')}" title="${tr('Назад')}">${ico('triL')}</button><b>${t ? `№ ${id} · ${esc(t.title || (topicName[t.topic] || (() => ''))())}` : `№ ${id}`}</b>${t ? `<span class="st ${stCls(t.status)}">${stName(t.status)}</span>` : ''}`
      + `${t && t.status !== 'closed' ? `<button type="button" class="btn alt sm" data-a="closeT">${S.closing ? tr('Закрыть? Да') : tr('Закрыть обращение')}</button>` : ''}<button class="x" data-a="close" aria-label="${tr('Закрыть')}" title="${tr('Закрыть')}">✕</button></div>`;
    if (!T) return `${head}<div class="sbody"><div class="empty">${S.therr ? `${esc(S.therr)}<button type="button" class="btn alt" data-a="retryT">${tr('Повторить')}</button>` : tr('Загружаем…')}</div></div>`;
    const msgs = (T.messages || []).map((m) => `<div class="msg ${m.author === 'support' ? 'sup' : 'me'}"><div class="who">${m.author === 'support' ? tr('Поддержка') : tr('Вы')} · ${esc(dFull(m.created_at))}</div><div class="tx">${esc(m.body)}</div>`
      + `${(m.files || []).length ? `<div class="clip">${m.files.map((f) => `${/^video\//.test(f.type || '') ? '▶ ' : ''}${esc(f.name)} · ${fmtSize(+f.size || 0)}`).join('<br>')}</div>` : ''}</div>`).join('');
    const F = S.R, lk = locked('reply');
    const comp = t.status === 'closed' ? `<div class="cl">${tr('Обращение закрыто')}</div>`
      : `${attHtml('reply')}<div class="reply"><textarea class="well" data-f="reply" maxlength="${S.lim.maxText}" rows="1" placeholder="${esc(tr('Написать ответ…'))}"${lk ? ' readonly' : ''}>${esc(F.text)}</textarea>${lk || total('reply') + S.packing >= S.lim.maxFiles ? '' : `<button type="button" class="btn alt" data-a="addf" data-k="reply">${tr('+ Файл')}</button>`}<button type="button" class="btn" data-a="send"${canSend('reply') ? '' : ' disabled'}>${sendLabel('reply')}</button></div>`;
    return `${head}${S.note ? `<div class="note">${esc(S.note)}</div>` : ''}<div class="thread">${msgs}</div>${errHtml()}${comp}`;
  }
  function viewGuest() {
    return `<div class="hd"><b>${tr('Поддержка')}</b><button class="x" data-a="close" aria-label="${tr('Закрыть')}" title="${tr('Закрыть')}">✕</button></div><div class="gmsg">${tr('Поддержка - только с аккаунтом игры')}<button type="button" class="btn" data-a="login">${tr('Войти')}</button></div>`;
  }
  function draw() {
    const keep = box.querySelector ? box.querySelector('.thread') : null, top = keep ? keep.scrollTop : 0, was = S.view;
    box.innerHTML = `<div class="swin${S.view === 'guest' ? ' gst' : ''}">${S.view === 'guest' ? viewGuest() : S.view === 'thread' ? viewThread() : S.view === 'list' ? viewList() : viewNew()}</div>`;
    const th = q('.thread'); if (th) th.scrollTop = was === 'thread' && keep && top < keep.scrollHeight - keep.clientHeight - 4 ? top : th.scrollHeight; // переписка: к последнему сообщению (если не листали вверх)
    paintBadges();
  }

  // ── события ──
  root.addEventListener('click', (e) => {
    if (e.target === root) { api.close(); return; } // тап мимо окна
    const t = e.target.closest && e.target.closest('[data-a]'); if (!t) return;
    const a = t.dataset.a;
    if (C.snd && C.snd.click && a !== 'shot') C.snd.click();
    if (a === 'close') api.close();
    else if (a === 'tab-new') { S.view = 'new'; S.err = ''; draw(); }
    else if (a === 'tab-list') { S.view = 'list'; S.err = ''; draw(); loadList(true); }
    else if (a === 'back') { S.view = 'list'; S.err = ''; S.th = null; draw(); loadList(); }
    else if (a === 'topic') { S.topic = t.dataset.k; draw(); }
    else if (a === 'addf') { addTo = t.dataset.k === 'reply' ? 'reply' : 'new'; fin.click(); }
    else if (a === 'rmf') { const F = form(S.view === 'thread' ? 'reply' : 'new'), f = F.files[+t.dataset.i]; if (f) { if (f.url) URL.revokeObjectURL(f.url); F.files.splice(+t.dataset.i, 1); S.err = ''; draw(); } }
    else if (a === 'rmshot') { S.shotOn = false; draw(); }
    else if (a === 'send') send(S.view === 'thread' ? 'reply' : 'new');
    else if (a === 'drop') { dropPend(); S.err = ''; draw(); }
    else if (a === 'open') openThread(t.dataset.id);
    else if (a === 'retry') { loadList(true); draw(); }
    else if (a === 'retryT') openThread(S.tid);
    else if (a === 'closeT') closeTicket();
    else if (a === 'login') { api.close(); if (C.account) C.account.open('login'); }
  });
  root.addEventListener('change', (e) => { const t = e.target; if (t && t.dataset && t.dataset.a === 'shot') { S.shotOn = !!t.checked; draw(); } });
  root.addEventListener('input', (e) => { // набор текста: перерисовывать нельзя (пропадёт фокус) - счётчик и кнопка правятся на месте
    const t = e.target, k = t && t.dataset && t.dataset.f; if (!k) return;
    form(k).text = t.value;
    const c = q('[data-r="cnt"]'); if (c) { const left = S.lim.maxText - t.value.length; c.textContent = left < NOTICE ? tr('Осталось знаков: {0}', [Math.max(0, left)]) : ''; c.classList.toggle('low', left < 50); }
    paintSend();
  });
  addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || !root.classList.contains('on') || (C.account && C.account.isOpen && C.account.isOpen())) return;
    if (S.view === 'thread') { S.view = 'list'; S.th = null; draw(); } else api.close();
  });

  const api = {
    // opts.battle - открыто из паузы в бою: снять кадр и предложить приложить его
    open(opts = {}) {
      const g = gameAcc(); resetFor(g); S.err = ''; S.note = ''; root.classList.add('on');
      if (!g) { S.view = 'guest'; draw(); return; }
      if (S.view === 'guest') S.view = 'new';
      S.inBattle = !!opts.battle;
      if (opts.battle) { dropShot(); takeShot(); } else dropShot();
      draw(); loadList(S.view === 'list');
    },
    close() { root.classList.remove('on'); S.inBattle = false; },
    isOpen: () => root.classList.contains('on'),
    unread: () => S.unread,
    badge: () => `<span class="supn">${S.unread > 0 ? S.unread : ''}</span>`, // для кнопок других окон (профиль, настройки, пауза)
    // меню показано / открыт профиль: список обращений не чаще раза в минуту, число непрочитанных - на кнопки
    touch(force) {
      const g = gameAcc(); if (!g) { resetFor(null); return; }
      if (!force && S.acc === g.id && Date.now() - S.listAt < FRESH) return;
      loadList();
    },
  };
  return api;
}
