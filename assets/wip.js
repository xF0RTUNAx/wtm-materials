// Vehicle page without an article: if another author has already taken this vehicle in the bot,
// show «Обзор уже пишут» and hide the «Написать обзор» button.
const acts = document.getElementById('wip-acts');
if (acts && acts.dataset.claims) {
  fetch(acts.dataset.claims).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((j) => {
    if (!j || !Array.isArray(j.keys) || !j.keys.includes(acts.dataset.claim)) return;
    document.getElementById('wip-taken').hidden = false;
    document.getElementById('wip-invite').hidden = true;
    const w = document.getElementById('wip-write');
    if (w) w.hidden = true;
  }).catch(() => { /* the invitation stays */ });
}
