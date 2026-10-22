// Maneuver theater page: catalog, 3D viewer controls, manual details.
import { MANEUVERS, SHOWS, PAGE, GROUPS } from '../sim/maneuvers.js';
import { Theater, CAMERAS, webglAvailable } from '../render/engine.js';
import { FlightAudio } from '../render/audio.js';
import { saveQuality } from '../render/quality.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const byId = (id) => MANEUVERS.find((m) => m.id === id);
const fmt = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

const params = new URLSearchParams(location.search);
const state = {
  show: SHOWS[params.get('show')] ? params.get('show') : 'all',
  group: GROUPS[params.get('group')] ? params.get('group') : 'all',
  q: '',
  id: null,
  index: -1,
  auto: params.get('auto') === '1'
};

// ---------- catalog ----------
const SHOW_TABS = [['all', 'All'], ['high', 'High'], ['low', 'Low'], ['flat', 'Flat'], ['c130', 'Fat Albert']];
const GROUP_TABS = [['all', 'Everyone'], ['diamond', 'Diamond'], ['solo', 'Solos'], ['delta', 'Delta']];

function entries() {
  let list = state.show === 'all' ? MANEUVERS.map((m) => m.id) : SHOWS[state.show].seq.slice();
  let items = list.map((id, i) => ({ m: byId(id), order: i }));
  if (state.group !== 'all') items = items.filter((x) => x.m.group === state.group);
  if (state.q) {
    const q = state.q.toLowerCase();
    items = items.filter((x) => `${x.m.name} ${x.m.ref} ${x.m.text} ${x.m.variant ?? ''}`.toLowerCase().includes(q));
  }
  return items;
}

function renderTabs() {
  $('showTabs').innerHTML = SHOW_TABS.map(([k, l]) => `<button class="tab" type="button" data-show="${k}" aria-pressed="${state.show === k}">${l}</button>`).join('');
  $('groupTabs').innerHTML = GROUP_TABS.map(([k, l]) => `<button class="tab" type="button" data-group="${k}" aria-pressed="${state.group === k}">${l}</button>`).join('');
}

function renderList() {
  const items = entries();
  $('count').textContent = `${items.length} maneuver${items.length === 1 ? '' : 's'}${state.show !== 'all' ? ` · ${SHOWS[state.show].name} order` : ''}`;
  if (!items.length) { $('list').innerHTML = '<li class="empty">No maneuvers match.</li>'; return; }
  $('list').innerHTML = items.map((x, i) => {
    const ord = state.show !== 'all' ? String(x.order + 1).padStart(2, '0') : x.m.ref;
    const current = x.m.id === state.id && (state.show === 'all' || i === state.index);
    return `<li><button type="button" data-id="${x.m.id}" data-i="${i}" aria-current="${current}">
      <span class="ord">${esc(ord)}</span><span class="nm">${esc(x.m.name)}</span>
      <span class="sb">${esc(GROUPS[x.m.group])}${x.m.variant ? ' · ' + esc(x.m.variant) : ''}</span></button></li>`;
  }).join('');
}

$('showTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-show]'); if (!b) return;
  state.show = b.dataset.show; state.index = -1;
  renderTabs(); renderList();
  const items = entries();
  const at = items.findIndex((x) => x.m.id === state.id);
  if (at >= 0) state.index = at; else if (items.length) select(items[0].m.id, 0);
  renderList(); syncUrl();
});
$('groupTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-group]'); if (!b) return;
  state.group = b.dataset.group; renderTabs(); renderList(); syncUrl();
});
$('q').addEventListener('input', (e) => { state.q = e.target.value.trim(); renderList(); });
$('list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-id]'); if (!b) return;
  select(b.dataset.id, Number(b.dataset.i));
  if (matchMedia('(max-width: 999px)').matches) $('viewer').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('auto').checked = state.auto;
$('auto').addEventListener('change', (e) => { state.auto = e.target.checked; if (theater) theater.loop = !state.auto; syncUrl(); });

function step(dir) {
  const items = entries();
  if (!items.length) return;
  let i = state.index >= 0 && items[state.index]?.m.id === state.id ? state.index : items.findIndex((x) => x.m.id === state.id);
  i = (i + dir + items.length) % items.length;
  select(items[i].m.id, i);
}

// ---------- detail panel ----------
function renderDetail(m) {
  const page = PAGE[m.ref];
  const shows = m.shows.map((s) => `<span class="tag">${esc(SHOWS[s].name)}</span>`).join('');
  const variant = m.variants && state.show !== 'all' && m.variants[state.show] ? `<p class="note">${esc(m.variants[state.show])} (this view follows the ${esc(SHOWS[state.show].name.toLowerCase())}).</p>` : '';
  $('detail').innerHTML = `
    <div class="detail-top">
      <div>
        <p class="eyebrow">Manual ${esc(m.ref)}${m.variant ? ' · ' + esc(m.variant) : ''}</p>
        <h2 class="display">${esc(m.name)}</h2>
        <div class="chips"><span class="tag">${esc(GROUPS[m.group])}</span>${shows}</div>
      </div>
      <a class="btn btn-small" href="maneuvers-manual.pdf#page=${page}" target="_blank" rel="noopener">Manual page ${esc(m.ref)} <span class="arrow" aria-hidden="true">↗</span></a>
    </div>
    <div class="data-grid">
      <div><span>Minimum altitude</span><b>${esc(m.data.min)}</b></div>
      <div><span>Maximum altitude</span><b>${esc(m.data.max)}</b></div>
      <div><span>Entry airspeed</span><b>${esc(m.data.kin)}${/\d/.test(m.data.kin) ? ' kts' : ''}</b></div>
      <div><span>Exit airspeed</span><b>${esc(m.data.kout)}${/\d/.test(m.data.kout) ? ' kts' : ''}</b></div>
    </div>
    <div class="manual-text">
      <span class="label">From the manual</span>
      <p>${esc(m.text)}</p>
      ${m.note ? `<p class="note">${esc(m.note)}</p>` : ''}
      ${variant}
    </div>
    <figure class="diagram">
      <button type="button" data-zoom="assets/img/manual/${esc(m.ref)}.jpg" aria-label="Enlarge manual diagram ${esc(m.ref)}"><img src="assets/img/manual/${esc(m.ref)}.jpg" alt="Maneuvers Manual diagram ${esc(m.ref)}: ${esc(m.name)}" loading="lazy" width="1100" height="825"></button>
      <figcaption><span>Manual diagram ${esc(m.ref)} — the crowd is at the bottom of the page.</span><a href="maneuvers-manual.pdf#page=${page}" target="_blank" rel="noopener">Open PDF page ${page} ↗</a></figcaption>
    </figure>
    <p class="disclaimer">Published altitudes and airspeeds are from the 2026 Maneuvers Manual. The 3D flight paths, timing and spacing are an illustrative interpretation of its diagrams and text, not flight data. Live telemetry describes the animation.</p>`;
}

const lb = $('lightbox');
document.addEventListener('click', (e) => {
  const z = e.target.closest('[data-zoom]');
  if (z) { $('lbImg').src = z.dataset.zoom; $('lbImg').alt = z.getAttribute('aria-label') || ''; $('lbCap').textContent = z.getAttribute('aria-label') || ''; lb.classList.add('open'); lb.querySelector('.lb-close').focus(); }
  if (e.target === lb || e.target.closest('.lb-close')) lb.classList.remove('open');
});

// ---------- viewer ----------
const stage = $('stage');
let theater = null;
let hudTick = 0, callTimer = null;
const audio = new FlightAudio();

function showCall(text, big) {
  const c = $('call');
  c.querySelector('span').textContent = text;
  c.classList.toggle('big', !!big);
  c.classList.add('show');
  clearTimeout(callTimer);
  callTimer = setTimeout(() => c.classList.remove('show'), big ? 2600 : 2200);
}

const Q_NEXT = { auto: 'high', high: 'low', low: 'auto' };
function qualityLabel() {
  if (!theater) return 'Quality';
  const lvl = theater.quality === 'low' ? 'Lite' : 'HD';
  return theater.qualityPref === 'auto' ? `Auto · ${lvl}` : lvl;
}
function renderCams() {
  const q = theater ? `<button class="pill pill-q" type="button" data-quality title="Rendering quality: Auto picks for your device and drops to Lite if playback is slow. HD = full detail, Lite = faster (lower resolution, smaller crowd, lighter smoke).">${qualityLabel()}</button>` : '';
  $('cams').innerHTML = Object.entries(CAMERAS).map(([k, l], i) => `<button class="pill" type="button" data-cam="${k}" aria-pressed="${theater?.mode === k}" title="${l} (${i + 1})">${l}</button>`).join('') + q;
}
$('cams').addEventListener('click', (e) => {
  if (e.target.closest('[data-quality]') && theater) {
    const next = Q_NEXT[theater.qualityPref] ?? 'auto';
    theater.setQualityPref(next); saveQuality(next); renderCams();
    showCall(next === 'auto' ? `Quality: auto (${theater.quality === 'low' ? 'Lite' : 'HD'})` : next === 'high' ? 'Quality: HD' : 'Quality: Lite');
    return;
  }
  const b = e.target.closest('[data-cam]'); if (!b || !theater) return;
  theater.setCamera(b.dataset.cam); renderCams(); syncUrl();
});

function renderJets() {
  if (!theater?.result) return;
  const ids = Object.keys(theater.result.tracks).map(Number).sort((a, b) => a - b);
  $('jets').innerHTML = ids.map((id) => `<button class="jet-chip" type="button" data-jet="${id}" aria-pressed="${theater.focusId === id}" aria-label="${id === 7 ? 'Fat Albert' : 'Blue Angel ' + id}">${id === 7 ? 'FA' : id}</button>`).join('');
}
$('jets').addEventListener('click', (e) => {
  const b = e.target.closest('[data-jet]'); if (!b || !theater) return;
  theater.setFocus(Number(b.dataset.jet)); renderJets();
});

function renderMarks() {
  const d = theater.duration || 1;
  $('marks').innerHTML = (theater.events || []).map((e) => `<i style="left:calc(${(e.t / d) * 100}% - 1px)" title="${esc(e.label)}"></i>`).join('');
}

function setPlayIcon() {
  const p = theater?.playing;
  $('play').setAttribute('aria-label', p ? 'Pause' : 'Play');
  $('play').innerHTML = p ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>' : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>';
}

function updateHud() {
  const s = theater.telemetry();
  if (!s) return;
  $('hAlt').textContent = Math.round(s.alt).toLocaleString();
  $('hKts').textContent = Math.round(s.kts);
  $('hG').textContent = s.g.toFixed(1);
  $('hAoa').textContent = s.aoa.toFixed(0);
  $('hPitch').textContent = s.pitch.toFixed(0);
  $('hBank').textContent = Math.round(s.bank);
}

function select(id, index = -1) {
  const m = byId(id);
  if (!m) return;
  state.id = id;
  state.index = index >= 0 ? index : entries().findIndex((x) => x.m.id === id);
  $('vRef').textContent = `MANUAL ${m.ref}`;
  $('vName').textContent = m.name;
  $('vSub').textContent = `${GROUPS[m.group]} · ${m.data.min} – ${m.data.max} AGL · ${m.data.kin}→${m.data.kout} kts`;
  document.title = `${m.name} | Blue Angels Maneuver Guide`;
  renderDetail(m);
  renderList();
  if (theater) {
    theater.load(id, { show: state.show === 'all' ? 'high' : state.show });
    theater.loop = !state.auto;
    renderJets(); renderMarks();
    theater.play(); setPlayIcon();
  }
  syncUrl();
}

function syncUrl() {
  const p = new URLSearchParams();
  if (state.id) p.set('m', state.id);
  if (state.show !== 'all') p.set('show', state.show);
  if (state.group !== 'all') p.set('group', state.group);
  if (theater && theater.mode !== 'crowd') p.set('cam', theater.mode);
  if (state.auto) p.set('auto', '1');
  history.replaceState(null, '', `${location.pathname}?${p}`);
}

function init() {
  renderTabs();
  const first = params.get('m') && byId(params.get('m')) ? params.get('m') : entries()[0]?.m.id ?? MANEUVERS[0].id;
  if (!webglAvailable()) {
    stage.innerHTML = '<div style="position:absolute;inset:0;display:grid;place-items:center;padding:24px;text-align:center;color:#cfd8e6">This 3D theater needs WebGL 2. The manual details and diagrams below still work.</div>';
    select(first);
    return;
  }
  theater = new Theater(stage, { autoplay: true, camera: CAMERAS[params.get('cam')] ? params.get('cam') : 'crowd' });
  theater.on('event', (e) => showCall(e.label, e.call));
  theater.on('time', (t) => {
    $('scrub').value = String(Math.round((t / (theater.duration || 1)) * 1000));
    $('time').textContent = `${fmt(t)} / ${fmt(theater.duration || 0)}`;
  });
  theater.on('frame', () => { if (++hudTick % 4 === 0) updateHud(); audio.update(theater); });
  theater.on('state', () => { setPlayIcon(); renderCams(); });
  theater.on('end', () => { if (state.auto) setTimeout(() => step(1), 1200); });
  theater.on('restart', () => showCall('Replay'));
  theater.on('quality-lowered', () => { renderCams(); showCall('Switched to Lite quality for smoother playback'); });
  renderCams();
  select(first);
}

// transport
$('play').addEventListener('click', () => { theater?.toggle(); setPlayIcon(); });
$('prev').addEventListener('click', () => step(-1));
$('next').addEventListener('click', () => step(1));
$('scrub').addEventListener('input', (e) => { if (theater) theater.seek((Number(e.target.value) / 1000) * theater.duration); });
$('speed').addEventListener('change', (e) => theater?.setSpeed(Number(e.target.value)));
$('opts').addEventListener('click', (e) => {
  const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', String(on)); theater?.setPaths(on);
});
$('boxBtn').addEventListener('click', (e) => {
  const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', String(on));
  if (theater) { theater.boxPref = on; theater.setBox(on); }
});
// Sound needs a user gesture to start (browser autoplay rules), so it is off until switched on.
// The speaker button turns it on/off; the pop-up slider sets the volume (remembered per browser).
let soundOn = false;
let volume = 70;
try { const v = Number(localStorage.getItem('ba-volume')); if (localStorage.getItem('ba-volume') !== null && v >= 0 && v <= 100) volume = v; } catch { /* storage unavailable */ }
const gainFor = (v) => 1.6 * (v / 100) ** 2;    // perceptual curve; 70 ≈ the original level

function showSound() {
  const b = $('snd');
  b.setAttribute('aria-pressed', String(soundOn));
  b.setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on');
  b.dataset.level = volume === 0 ? 'mute' : volume >= 50 ? 'hi' : 'lo';
  $('volume').value = String(volume);
  $('volume').setAttribute('aria-valuetext', `${volume} percent`);
  $('volPct').textContent = String(volume);
}
async function setSound(on) {
  soundOn = on;                       // update synchronously so rapid clicks never race
  showSound();
  try { localStorage.setItem('ba-sound', on ? '1' : '0'); } catch { /* storage unavailable */ }
  if (!on) { audio.disable(); return; }
  if (on) peekVolume();
  if (!(await audio.enable()) && soundOn) { soundOn = false; showSound(); }
}
function setVolume(v) {
  volume = Math.max(0, Math.min(100, Math.round(v)));
  audio.setVolume(gainFor(volume));
  showSound();
  try { localStorage.setItem('ba-volume', String(volume)); } catch { /* storage unavailable */ }
  if (!soundOn && volume > 0) setSound(true);    // raising the slider implies "I want sound"
  peekVolume();
}
// briefly show the slider (touch screens have no hover)
let peekTimer = null;
function peekVolume() {
  $('vol').classList.add('open');
  clearTimeout(peekTimer);
  peekTimer = setTimeout(() => $('vol').classList.remove('open'), 2500);
}
audio.setVolume(gainFor(volume));
showSound();
$('snd').addEventListener('click', () => setSound(!soundOn));
$('volume').addEventListener('input', (e) => setVolume(Number(e.target.value)));
// a returning visitor who left sound on gets it back on their first interaction with the page
try {
  if (localStorage.getItem('ba-sound') === '1') {
    const resume = (e) => {
      removeEventListener('pointerdown', resume, true); removeEventListener('keydown', resume, true);
      if (e.target.closest?.('#vol') || (e.key && e.key.toLowerCase() === 'm')) return;   // the controls decide
      if (!soundOn) setSound(true);
    };
    addEventListener('pointerdown', resume, true); addEventListener('keydown', resume, true);
  }
} catch { /* storage unavailable */ }

$('fs').addEventListener('click', () => {
  const v = $('viewer');
  if (document.fullscreenElement) document.exitFullscreen(); else v.requestFullscreen?.();
});

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (lb.classList.contains('open')) { if (e.key === 'Escape') lb.classList.remove('open'); return; }
  if (!theater) return;
  const cams = Object.keys(CAMERAS);
  if (e.key === ' ') { e.preventDefault(); theater.toggle(); setPlayIcon(); }
  else if (e.key === 'ArrowRight') theater.seek(theater.t + 5);
  else if (e.key === 'ArrowLeft') theater.seek(theater.t - 5);
  else if (e.key === ']' || e.key === 'PageDown') step(1);
  else if (e.key === '[' || e.key === 'PageUp') step(-1);
  else if (e.key.toLowerCase() === 'f') $('fs').click();
  else if (e.key.toLowerCase() === 'm') setSound(!soundOn);
  else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && soundOn) { e.preventDefault(); setVolume(volume + (e.key === 'ArrowUp' ? 10 : -10)); }
  else if (/^[1-6]$/.test(e.key)) { theater.setCamera(cams[Number(e.key) - 1]); renderCams(); syncUrl(); }
});

init();
