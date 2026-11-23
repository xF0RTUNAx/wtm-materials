// Vehicle article: «Народный рейтинг» (Firebase, key = rating_id, same data as the old site)
// and Telegram comments (thread = comments_thread).
import { T, LANG, plural } from './site.js';
import './article.js';

const D = JSON.parse(document.getElementById('page-data').textContent);

// ---------- rating ----------
const box = document.getElementById('rating');
if (box) {
  const id = box.dataset.rating;
  const stars = [...box.querySelectorAll('#stars button')];
  const note = document.getElementById('rate-note');
  const avgEl = document.getElementById('rate-avg'), cntEl = document.getElementById('rate-count');
  const KEY = 'voted_' + id; // same key as the old pages, so earlier votes still count
  const voted = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const paint = (n) => stars.forEach((s, i) => s.classList.toggle('on', i < n));
  note.textContent = T('v.ratingLoading');
  let started = false;
  const start = async () => {
    if (started) return; started = true;
    try {
      const { initializeApp } = await import(D.sdk + 'firebase-app.js');
      const { getDatabase, ref, runTransaction, onValue } = await import(D.sdk + 'firebase-database.js');
      const app = initializeApp(D.firebase);
      const db = getDatabase(app, D.firebase.databaseURL);
      const r = ref(db, 'ratings/' + id);
      stars.forEach((s) => { s.disabled = false; });
      note.textContent = voted() ? T('v.ratingAlready') : T('v.ratingPrompt');
      const v0 = +voted(); if (v0 > 0) paint(v0);
      onValue(r, (snap) => {
        const d = snap.val();
        if (d && d.count > 0) {
          avgEl.textContent = (d.sum / d.count).toFixed(1);
          cntEl.textContent = T('v.ratingAvg', { avg: (d.sum / d.count).toFixed(1), n: d.count, unit: plural(T('n.vote'), d.count) }).replace((d.sum / d.count).toFixed(1), '').trim();
        } else { avgEl.textContent = '0.0'; cntEl.textContent = ''; if (!voted()) note.textContent = T('v.ratingNone'); }
      }, () => { note.textContent = T('v.ratingError'); });
      box.querySelector('#stars').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        const v = +b.dataset.v;
        if (voted()) { note.textContent = T('v.ratingAlready'); return; }
        note.textContent = T('v.ratingSending');
        runTransaction(r, (cur) => (cur === null ? { sum: v, count: 1 } : { sum: (cur.sum || 0) + v, count: (cur.count || 0) + 1 }))
          .then(() => {
            try { localStorage.setItem(KEY, String(v)); } catch { /* ignore */ }
            paint(v); stars.forEach((s) => s.setAttribute('aria-checked', String(+s.dataset.v === v)));
            note.textContent = T('v.ratingThanks');
          })
          .catch(() => { note.textContent = T('v.ratingError'); });
      });
    } catch { note.textContent = T('v.ratingError'); }
  };
  // hover preview on devices with a mouse
  stars.forEach((s, i) => { s.addEventListener('mouseenter', () => { if (!s.disabled && !voted()) paint(i + 1); }); });
  box.querySelector('#stars').addEventListener('mouseleave', () => { const v = +voted(); paint(v > 0 ? v : 0); });
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: '600px 0px' });
    io.observe(box);
  } else start();
}

// ---------- Telegram comments ----------
const com = document.getElementById('comments');
if (com) {
  const host = document.getElementById('tg-comments');
  const load = () => {
    host.innerHTML = '';
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://telegram.org/js/telegram-widget.js?22&lang=${LANG}`;
    s.setAttribute('data-telegram-discussion', com.dataset.thread);
    s.setAttribute('data-comments-limit', com.dataset.limit);
    s.setAttribute('data-colorful', '1');
    if (document.documentElement.getAttribute('data-theme') !== 'light') s.setAttribute('data-dark', '1');
    host.appendChild(s);
  };
  let loaded = false;
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => {
    if (es.some((e) => e.isIntersecting)) { io.disconnect(); loaded = true; load(); }
  }, { rootMargin: '400px 0px' }) : null;
  if (io) io.observe(com); else { loaded = true; load(); }
  document.addEventListener('themechange', () => { if (loaded) load(); });
}

// ---------- video preview: prefer the large thumbnail when YouTube has one ----------
document.querySelectorAll('.vprev img[data-max]').forEach((img) => {
  const big = new Image();
  big.onload = () => { if (big.naturalWidth > 200) img.src = big.src; };
  const go = () => { big.src = img.dataset.max; };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: '400px 0px' });
    io.observe(img);
  } else go();
});
