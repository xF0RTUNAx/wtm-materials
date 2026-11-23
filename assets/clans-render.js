// Clan cards: one renderer for the generator and for the browser (live list from clansEndpoint).
// S - language strings and helpers, I - icon SVG strings. Same JSON shape as site/data/clans.json.

export function visibleClans(list, min) {
  const authors = list.filter((c) => c.authorClan);
  const rest = list.filter((c) => !c.authorClan && (c.articles || 0) >= min)
    .sort((a, b) => (b.articles || 0) - (a.articles || 0) || String(a.name).localeCompare(String(b.name)));
  return authors.concat(rest);
}

const tx = (v, lang) => (v && typeof v === 'object' ? v[lang] ?? v.ru ?? '' : v ?? '');

export function clanCard(c, S, I, o = {}) {
  const e = S.esc, lang = S.lang;
  const photos = (c.photos || []).filter(Boolean);
  const id = 'clan-' + String(c.id).replace(/[^a-z0-9-]/gi, '');
  const name = e(c.name) + (c.tag ? ` <span class="clan__tag">[${e(c.tag)}]</span>` : '');
  // the author's clan stands first without a label and without an article count
  const status = c.authorClan ? '' : `<span class="clan__arts"><b>${c.articles || 0}</b> ${e(S.articles(c.articles || 0))}</span>`;
  const camps = (c.campaigns || []).map((k) => `<span class="clan__camp" title="${e(S.campaign[k] || k)}">${I[k] || ''}<span class="sr">${e(S.campaign[k] || k)}</span></span>`).join('');
  const facts = [
    c.region ? `<span>${I.pin}${e(tx(c.region, lang))}</span>` : '',
    c.language ? `<span>${I.lang}${e(tx(c.language, lang))}</span>` : '',
    c.members ? `<span>${I.users}${e(c.members)}</span>` : '',
    camps ? `<span class="clan__camps">${camps}</span>` : '',
  ].filter(Boolean).join('');
  const photo = photos.length
    ? `<a class="clan__photo" href="${e(o.photoHref || photos[0])}"${o.photoHref ? '' : ` data-gallery="${e(c.id)}" data-i="0"`} aria-label="${e(S.photoOf.replace('{name}', c.name))}"><img src="${e(photos[0])}" alt="" loading="lazy" decoding="async">${photos.length > 1 ? `<span class="clan__count">${I.images}${photos.length}</span>` : ''}</a>`
    : `<span class="clan__photo clan__photo--none">${I.clan}</span>`;
  const desc = !o.compact && tx(c.description, lang) ? `<p class="clan__desc">${e(tx(c.description, lang))}</p>` : '';
  const more = !o.compact ? `${c.gameId ? `<p class="clan__id">${e(S.gameId)}: <button type="button" class="copy" data-copy="${e(c.gameId)}" data-copied="${e(S.copied)}" aria-label="${e(S.copyId.replace('{id}', c.gameId))}"><span class="num">${e(c.gameId)}</span>${I.copy}<span class="copy__note" aria-live="polite"></span></button></p>` : ''}${c.contact && c.contact.url ? `<a class="btn clan__contact" href="${e(c.contact.url)}" target="_blank" rel="noopener">${I.send}<span>${e(tx(c.contact.label, lang) || S.contact)}</span></a>` : ''}` : '';
  return `<article class="clan${c.authorClan ? ' clan--author' : ''}${o.compact ? ' clan--compact' : ''}" id="${o.compact ? 'home-' + id : id}">${photo}<div class="clan__body"><h3 class="clan__name">${name}</h3>${status}<p class="clan__facts">${facts}</p>${desc}${more}</div></article>`;
}
