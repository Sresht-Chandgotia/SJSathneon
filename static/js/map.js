(function initMap() {
  // --- MAP SETUP ---
  const southWest = L.latLng(-85, -180);
  const northEast = L.latLng(85, 180);
  const worldBounds = L.latLngBounds(southWest, northEast);

  // Initialize map (default: India)
  const map = L.map("map", {
    zoomControl: true,
    minZoom: 3,
    maxBounds: worldBounds,
    maxBoundsViscosity: 0.8,
    worldCopyJump: false,
    inertia: true,
  }).setView([20.5937, 78.9629], 5);

  // Base tiles
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    noWrap: true,
    bounds: worldBounds,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  // --- MARKER LAYER ---
  const markersLayer = L.layerGroup().addTo(map);
  function clearMarkers() {
    markersLayer.clearLayers();
  }

  // --- ✅ USER LOCATION (precise & smooth) ---
  let userMarker = null;
  let userCircle = null;
  let hasCentered = false;

  // Inject CSS for pulsing dot
  const style = document.createElement("style");
  style.textContent = `
    @keyframes pulse {
      0% { transform: scale(1); opacity: 1; }
      70% { transform: scale(2); opacity: 0; }
      100% { transform: scale(1); opacity: 0; }
    }
    .pulse-dot {
      position: relative;
      width: 14px;
      height: 14px;
      background: #2563eb;
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 0 6px rgba(37,99,235,0.8);
    }
    .pulse-dot::after {
      content: "";
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      border-radius: 50%;
      background: rgba(96,165,250,0.5);
      animation: pulse 2s infinite;
    }
  `;
  document.head.appendChild(style);

  // Update marker + circle
  function updateUserLocation(lat, lon, accuracy) {
    const latlng = L.latLng(lat, lon);
    const radius = Math.min(accuracy, 100); // cap radius to 100 m for visuals

    if (!userMarker) {
      const userIcon = L.divIcon({
        className: "",
        html: `<div class="pulse-dot"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      userMarker = L.marker(latlng, { icon: userIcon }).addTo(map);
    } else {
      userMarker.setLatLng(latlng);
    }

    if (!userCircle) {
      userCircle = L.circle(latlng, {
        radius,
        color: "#3b82f6",
        fillColor: "#60a5fa",
        fillOpacity: 0.2,
        weight: 1,
      }).addTo(map);
    } else {
      userCircle.setLatLng(latlng);
      userCircle.setRadius(radius);
    }

    if (!hasCentered) {
      map.setView(latlng, 15);
      hasCentered = true;
    }
  }

  // --- Use native Geolocation API for better control ---
  function startHighAccuracyWatch() {
    if (!navigator.geolocation) {
      console.warn("Geolocation not supported.");
      return;
    }

    navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;

        // Retry request if accuracy is poor (> 1000m)
        if (accuracy > 1000) {
          console.warn("Low accuracy detected:", accuracy);
          return;
        }

        updateUserLocation(latitude, longitude, accuracy);
      },
      (err) => {
        console.warn("Geolocation error:", err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );
  }

  startHighAccuracyWatch();

  // --- ✅ EXPORT FOR APP.JS ---
  window.map = map;
  window.markersLayer = markersLayer;
  window.clearMarkers = clearMarkers;
  window.__NAV__ = { map, markersLayer, clearMarkers };
})();
