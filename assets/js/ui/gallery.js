// Galleries: index of shows from data/galleries.json, and a single gallery (?g=id) with a lightbox.
// Data format (see README):
// { "galleries": [ { "id", "title", "location", "date", "description", "cover",
//                     "photos": [ { "src", "thumb", "w", "h", "caption", "credit" } ] } ] }

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDate = (d) => { const t = new Date(d + 'T12:00:00'); return isNaN(t) ? '' : t.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); };

async function load() {
  try {
    const r = await fetch('data/galleries.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    return (await r.json()).galleries ?? [];
  } catch {
    return [];
  }
}

function empty() {
  $('galBody').innerHTML = `<div class="empty-state">
    <p class="eyebrow">Coming soon</p>
    <h2 class="display">The first galleries are on the way.</h2>
    <p>Photo sets from Blue Angels shows will appear here, grouped by show site and season. In the meantime, every maneuver is ready to watch in 3D.</p>
    <a class="btn btn-primary" href="maneuvers.html">Open the maneuver theater <span class="arrow" aria-hidden="true">→</span></a>
  </div>`;
}

function index(list) {
  const sorted = list.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  $('galBody').innerHTML = `<div class="gal-grid">${sorted.map((g) => `
    <a class="gal-card" href="gallery.html?g=${encodeURIComponent(g.id)}">
      <div class="cover" style="background-image:url('${esc(g.cover || g.photos?.[0]?.thumb || g.photos?.[0]?.src || '')}')" role="img" aria-label="${esc(g.title)} cover photo"></div>
      <div class="body"><h3 class="display">${esc(g.title)}</h3><p>${esc(g.location)}${g.date ? ' · ' + esc(fmtDate(g.date)) : ''} · ${g.photos?.length ?? 0} photos</p></div>
    </a>`).join('')}</div>`;
}

let photos = [], at = 0;
function single(g) {
  document.title = `${g.title} | Galleries | Blue Angels Maneuver Guide`;
  $('crumbs').hidden = false;
  $('crumbHere').textContent = g.title;
  $('galEyebrow').textContent = [g.location, fmtDate(g.date)].filter(Boolean).join(' · ');
  $('galTitle').textContent = g.title;
  $('galLede').textContent = g.description || `${g.photos?.length ?? 0} photos`;
  photos = g.photos ?? [];
  $('galBody').innerHTML = photos.length
    ? `<div class="masonry">${photos.map((p, i) => `<button type="button" data-i="${i}" aria-label="Open photo ${i + 1}${p.caption ? ': ' + esc(p.caption) : ''}"><img src="${esc(p.thumb || p.src)}" alt="${esc(p.caption || g.title)}" loading="lazy"${p.w && p.h ? ` width="${p.w}" height="${p.h}"` : ''}></button>`).join('')}</div>`
    : '<div class="empty-state"><h2 class="display">Photos coming soon.</h2></div>';
}

const lb = $('lightbox');
function show(i) {
  at = (i + photos.length) % photos.length;
  const p = photos[at];
  $('lbImg').src = p.src; $('lbImg').alt = p.caption || '';
  $('lbCap').textContent = [p.caption, p.credit ? `Photo: ${p.credit}` : '', `${at + 1} / ${photos.length}`].filter(Boolean).join(' · ');
  lb.classList.add('open');
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('.masonry [data-i]');
  if (b) { show(Number(b.dataset.i)); lb.querySelector('.lb-close').focus(); return; }
  if (e.target.closest('.lb-prev')) show(at - 1);
  else if (e.target.closest('.lb-next')) show(at + 1);
  else if (e.target === lb || e.target.closest('.lb-close')) lb.classList.remove('open');
});
document.addEventListener('keydown', (e) => {
  if (!lb.classList.contains('open')) return;
  if (e.key === 'Escape') lb.classList.remove('open');
  if (e.key === 'ArrowLeft') show(at - 1);
  if (e.key === 'ArrowRight') show(at + 1);
});
let tx = null;
lb.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
lb.addEventListener('touchend', (e) => { if (tx == null) return; const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 50) show(at + (dx < 0 ? 1 : -1)); tx = null; });

(async () => {
  const list = await load();
  const id = new URLSearchParams(location.search).get('g');
  const g = id && list.find((x) => x.id === id);
  if (g) single(g);
  else if (list.length) index(list);
  else empty();
})();
