// Expandable rail/panel logic + map resize
const hud = document.getElementById('hud');
const btnOpen = document.getElementById('hudToggle');
const btnClose = document.getElementById('hudClose');
const statusText = document.getElementById('statusText');

if (statusText) statusText.textContent = 'HUD Online';

function setExpanded(expanded) {
  if (!hud) return;
  hud.classList.toggle('expanded', expanded);
  if (btnOpen) btnOpen.setAttribute('aria-expanded', String(expanded));
  // Nudge Leaflet to recalc sizes after the transition
  const map = window.__NAV__?.map;
  if (map) setTimeout(() => map.invalidateSize(), 320);
}

btnOpen?.addEventListener('click', () => setExpanded(true));
btnClose?.addEventListener('click', () => setExpanded(false));

// Rail icon focus → auto open specific section (optional UX sugar)
document.querySelectorAll('.rail-icon').forEach(el => {
  el.addEventListener('click', () => setExpanded(true));
});

// Close panel with Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setExpanded(false);
});

// Reflow map on window resize
window.addEventListener('resize', () => {
  const map = window.__NAV__?.map;
  if (map) map.invalidateSize();
});
