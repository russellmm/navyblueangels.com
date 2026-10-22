// The Show page: profile tabs and ordered sequences linking into the theater.
import { MANEUVERS, SHOWS } from '../sim/maneuvers.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const byId = (id) => MANEUVERS.find((m) => m.id === id);
const keys = ['high', 'low', 'flat', 'c130'];
let current = keys.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'high';

function render() {
  document.getElementById('tabs').innerHTML = keys.map((k) => `<button class="tab" type="button" data-k="${k}" aria-pressed="${k === current}">${esc(SHOWS[k].name)}</button>`).join('');
  const s = SHOWS[current];
  document.getElementById('summary').innerHTML = `
    <p class="eyebrow">${esc(s.ceiling)}</p>
    <h3 class="display">${esc(s.name)}</h3>
    <p>${esc(s.blurb)}</p>
    <p>${s.seq.length} maneuvers, listed in the order of the manual's table of contents.${current === 'high' ? ' The high show list includes alternates the team picks between on the day, such as the three takeoff options.' : ''}</p>
    <a class="btn btn-primary" href="maneuvers.html?show=${current}&auto=1">Play the ${esc(s.name.toLowerCase())} <span class="arrow" aria-hidden="true">→</span></a>`;
  document.getElementById('seq').innerHTML = s.seq.map((id, i) => {
    const m = byId(id);
    return `<li><a href="maneuvers.html?m=${id}&show=${current}"><span class="i">${String(i + 1).padStart(2, '0')}</span><span class="n">${esc(m.name)}</span><span class="r">${esc(m.ref)}</span></a></li>`;
  }).join('');
}

document.getElementById('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-k]');
  if (!b) return;
  current = b.dataset.k;
  history.replaceState(null, '', `#${current}`);
  render();
});
render();
