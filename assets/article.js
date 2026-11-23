// Section switcher of articles and guides: marks the current section and keeps it in view.
import './site.js';

const toc = document.getElementById('toc');
if (toc) {
  const links = [...toc.querySelectorAll('a')];
  const secs = links.map((a) => document.getElementById(a.getAttribute('href').slice(1)));
  let last = -2;
  const cur = () => {
    const line = toc.getBoundingClientRect().bottom + 24;
    let k = -1;
    secs.forEach((s, i) => { if (s && s.getBoundingClientRect().top <= line) k = i; });
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) k = secs.length - 1;
    if (k === last) return;
    last = k;
    links.forEach((a, i) => (i === k ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
    if (k >= 0) toc.scrollTo({ left: links[k].offsetLeft - 12, behavior: 'auto' });
  };
  window.addEventListener('scroll', cur, { passive: true });
  cur();
}
