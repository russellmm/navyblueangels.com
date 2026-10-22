// Shared page behavior: theme switch, mobile menu, footer year.
const THEMES = ['cinematic', 'team'];
const LABELS = { cinematic: 'Cinematic', team: 'Team colors' };

function currentTheme() { return document.documentElement.dataset.theme || 'cinematic'; }

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('ba-theme', t); } catch { /* storage unavailable */ }
  for (const b of document.querySelectorAll('[data-theme-toggle]')) {
    const next = THEMES[(THEMES.indexOf(t) + 1) % THEMES.length];
    b.querySelector('.theme-label').textContent = LABELS[t];
    b.setAttribute('aria-label', `Theme: ${LABELS[t]}. Switch to ${LABELS[next]}`);
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'team' ? '#0b2a66' : '#05080f');
}

for (const b of document.querySelectorAll('[data-theme-toggle]')) {
  b.addEventListener('click', () => {
    const t = currentTheme();
    applyTheme(THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]);
  });
}
applyTheme(currentTheme());

const menu = document.querySelector('[data-menu]');
const nav = document.getElementById('site-nav');
if (menu && nav) {
  menu.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
  });
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); } });
}

for (const y of document.querySelectorAll('[data-year]')) y.textContent = String(new Date().getFullYear());
