(function initMap() {
  // Geographic bounds to keep the map in view
  const southWest = L.latLng(-85, -180);
  const northEast = L.latLng(85, 180);
  const worldBounds = L.latLngBounds(southWest, northEast);

  // Initialize map (default view: India)
  const map = L.map("map", {
    zoomControl: true,
    minZoom: 3,
    maxBounds: worldBounds,
    maxBoundsViscosity: 0.8,
    worldCopyJump: false,
    inertia: true,
  }).setView([20.5937, 78.9629], 5);

  // Base map tiles
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    noWrap: true,
    bounds: worldBounds,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  // Marker layer for dynamic markers
  const markersLayer = L.layerGroup().addTo(map);

  // Helper to clear markers (used by search and categories)
  function clearMarkers() {
    markersLayer.clearLayers();
  }

  // --- ✅ Handle user location ---
  map.locate({ setView: true, maxZoom: 16 });

  map.on("locationfound", (e) => {
    // Limit the radius to avoid huge circles
    const radius = Math.min(e.accuracy / 4, 300); // capped at 300m

    // Draw a subtle blue circle for location accuracy
    L.circle(e.latlng, {
      radius,
      color: "#3b82f6",
      fillColor: "#60a5fa",
      fillOpacity: 0.25,
      weight: 1,
    }).addTo(map);

    // Create a small glowing dot for the exact position
    const userIcon = L.divIcon({
      className: "user-location-dot",
      html: `<div style="
        width: 12px;
        height: 12px;
        background: #2563eb;
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 0 6px rgba(37,99,235,0.8);
      "></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });

    L.marker(e.latlng, { icon: userIcon })
      .addTo(map)
      .bindPopup("You are here")
      .openPopup();

    map.setView(e.latlng, 14);
  });

  map.on("locationerror", () => {
    console.warn("Location access denied, using default view.");
  });

  // --- ✅ Expose for other scripts (like app.js) ---
  window.map = map;
  window.markersLayer = markersLayer;
  window.clearMarkers = clearMarkers;
  window.__NAV__ = { map, markersLayer, clearMarkers };
})();
