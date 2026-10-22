// Home page: live 3D hero reel, featured maneuver cards, show profiles.
import { MANEUVERS, SHOWS } from '../sim/maneuvers.js';

const byId = (id) => MANEUVERS.find((m) => m.id === id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- stats, featured, profiles ----------
document.getElementById('statCount').textContent = String(MANEUVERS.length);

const FEATURED = [
  ['diamond-roll', 'Four jets roll as one, topping out near 3,200 feet.'],
  ['fleur', 'Six jets split from the Double V into a blooming loop.'],
  ['loop-break-cross', 'A Delta loop that breaks six ways and returns for a simultaneous cross.'],
  ['knife-edge', 'The solos meet at center point on their wingtips at 400 knots.'],
  ['sneak-vertical', '#6 pulls to 85° and rolls straight up past 10,000 feet.'],
  ['high-alpha', 'The solos slow to 120 knots, noses high, before #6 pitches up and away.']
];
const featured = document.getElementById('featured');
featured.innerHTML = FEATURED.map(([id, blurb]) => {
  const m = byId(id);
  const tags = [m.group === 'solo' ? 'Solos' : m.group === 'delta' ? 'Delta' : 'Diamond', ...m.shows.filter((s) => s !== 'c130').map((s) => s)];
  return `<a class="m-card" href="maneuvers.html?m=${id}">
    <div class="m-card-media" style="background-image:url('assets/img/stills/${id}.jpg'), url('assets/img/manual/${m.ref}.jpg')"><span class="m-card-ref">MANUAL ${esc(m.ref)}</span></div>
    <div class="m-card-body"><h3 class="display">${esc(m.name)}</h3><p>${esc(blurb)}</p>
    <div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div></div></a>`;
}).join('');

const profiles = document.getElementById('profiles');
profiles.innerHTML = ['high', 'low', 'flat'].map((k, i) => {
  const s = SHOWS[k];
  return `<article class="profile"><span class="num">0${i + 1}</span>
    <div><h3 class="display">${esc(s.name)}</h3><p>${esc(s.blurb)}</p></div>
    <div><span class="ceiling">${esc(s.ceiling)}</span><p>${s.seq.length} maneuvers in sequence</p></div>
    <a class="btn btn-small" href="maneuvers.html?show=${k}">Play the ${k} show <span class="arrow" aria-hidden="true">→</span></a></article>`;
}).join('');

// ---------- latest gallery teaser ----------
fetch('data/galleries.json', { cache: 'no-cache' }).then((r) => r.json()).then(({ galleries = [] }) => {
  const g = galleries.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  if (!g?.photos?.length) return;
  const d = new Date(g.date + 'T12:00:00');
  document.getElementById('galEyebrow').textContent = `Latest · ${g.location}${isNaN(d) ? '' : ' · ' + d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`;
  document.getElementById('galLede').textContent = g.description || document.getElementById('galLede').textContent;
  const link = document.getElementById('galLink');
  link.href = `gallery.html?g=${encodeURIComponent(g.id)}`;
  link.firstChild.textContent = `See ${g.title} `;
  const frames = document.getElementById('galFrames');
  const order = [2, 0, 1, 3, 4].filter((i) => g.photos[i]);
  frames.innerHTML = order.map((i) => `<div style="background-image:url('${g.photos[i].thumb || g.photos[i].src}');border-style:solid"></div>`).join('');
}).catch(() => {});

// ---------- hero reel ----------
const REEL = [
  { id: 'delta-roll', cam: 'photo', from: 16, to: 40 },
  { id: 'aileron-roll', cam: 'photo', from: 9, to: 23 },
  { id: 'changeover', cam: 'photo', from: 18, to: 34 },
  { id: 'fleur', cam: 'crowd', from: 12, to: 44 },
  { id: 'diamond-roll', cam: 'chase', from: 14, to: 32 }
];

const stage = document.getElementById('heroStage');
const poster = document.getElementById('heroPoster');
poster.style.backgroundImage = "url('assets/img/stills/hero.jpg')";
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

async function startHero() {
  const { Theater, webglAvailable } = await import('../render/engine.js');
  if (!webglAvailable()) return;
  const th = new Theater(stage, { autoplay: !reduced, loop: false, camera: 'photo', maxPixelRatio: 1.5 });
  let k = 0;
  const nf = document.getElementById('nowFlying');
  const play = () => {
    const item = REEL[k % REEL.length];
    const m = byId(item.id);
    th.load(item.id, { t: item.from });
    th.setCamera(item.cam);
    th.blend = null;
    document.getElementById('nfRef').textContent = `Manual ${m.ref}`;
    document.getElementById('nfName').textContent = m.name;
    document.getElementById('nfLink').href = `maneuvers.html?m=${item.id}`;
    nf.hidden = false;
  };
  th.on('frame', (t) => {
    const item = REEL[k % REEL.length];
    if (t >= item.to) { k++; play(); }
  });
  play();
  if (reduced) th.pause();
  stage.style.opacity = '0';
  stage.style.transition = 'opacity 1.2s ease';
  requestAnimationFrame(() => requestAnimationFrame(() => { stage.style.opacity = '1'; }));
}
startHero().catch((e) => console.warn('3D hero unavailable', e));
