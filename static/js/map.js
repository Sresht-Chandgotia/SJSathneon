(function initMap() {
  // Geographic bounds to keep the map in view (avoid infinite wraps)
  const southWest = L.latLng(-85, -180);
  const northEast = L.latLng( 85,  180);
  const worldBounds = L.latLngBounds(southWest, northEast);

  const map = L.map('map', {
    zoomControl: true,
    minZoom: 3,                   // don’t allow silly zoom-out
    maxBounds: worldBounds,       // clamp panning
    maxBoundsViscosity: 0.8,      // gentle rubber band at edges
    worldCopyJump: false,
    inertia: true
  }).setView([20.5937, 78.9629], 5);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    noWrap: true,                 // prevent horizontal wrap
    bounds: worldBounds,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // expose for other scripts
  window.__NAV__ = { map };
})();
