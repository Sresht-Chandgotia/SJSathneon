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

  // Inject CSS for pulsing dot + dest pin
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
    .destination-pin {
      width: 18px;
      height: 18px;
      background: radial-gradient(circle at 35% 30%, #00f3ff, #0077ff);
      border: 2px solid white;
      border-radius: 50% 50% 50% 50%;
      box-shadow: 0 0 10px rgba(0,243,255,0.6);
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

    // If a route exists, update the from waypoint to the new live location
    if (window.__NAV__ && window.__NAV__.routeControl && window.__NAV__.destinationMarker) {
      try {
        window.__NAV__.routeControl.setWaypoints([latlng, window.__NAV__.destinationMarker.getLatLng()]);
      } catch (e) {
        // silent fail: routeControl may not be ready
        console.warn("Failed to update route waypoints:", e);
      }
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

  // ----------------------------
  // DESTINATION + ROUTING LOGIC
  // ----------------------------
  let destinationMarker = null;
  let routeControl = null;
  let lastFitOnce = false; // we will fit bounds the first time route is created

  function createDestinationMarker(latlng) {
    // create draggable marker with custom icon
    const destIcon = L.divIcon({
      className: "",
      html: `<div class="destination-pin"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });

    if (!destinationMarker) {
      destinationMarker = L.marker(latlng, { icon: destIcon, draggable: true }).addTo(map);
      destinationMarker.on("dragend", () => {
        // recalc route when user drags destination
        updateRoute();
      });
      destinationMarker.bindPopup("Destination").openPopup();
    } else {
      destinationMarker.setLatLng(latlng);
    }

    // store on global NAV for other modules
    window.__NAV__.destinationMarker = destinationMarker;
    return destinationMarker;
  }

  function clearDestination() {
    if (destinationMarker) {
      try { map.removeLayer(destinationMarker); } catch (e) {}
      destinationMarker = null;
      if (window.__NAV__) window.__NAV__.destinationMarker = null;
    }
    if (routeControl) {
      try { map.removeControl(routeControl); } catch (e) {}
      routeControl = null;
      if (window.__NAV__) window.__NAV__.routeControl = null;
    }
    lastFitOnce = false;
  }

  function updateRoute() {
    // If no destination or no user marker, remove route (or do nothing)
    if (!destinationMarker || !userMarker) {
      if (routeControl) {
        try { map.removeControl(routeControl); } catch (e) {}
        routeControl = null;
      }
      if (window.__NAV__) window.__NAV__.routeControl = null;
      return;
    }

    const from = userMarker.getLatLng();
    const to = destinationMarker.getLatLng();

    // if routeControl exists, only update waypoints (cheap)
    if (routeControl) {
      try {
        routeControl.setWaypoints([from, to]);
      } catch (e) {
        console.warn("setWaypoints failed, recreating routeControl:", e);
        // fallback recreate
        try { map.removeControl(routeControl); } catch (er) {}
        routeControl = null;
      }
      return;
    }

    // Create new routing control
    routeControl = L.Routing.control({
      waypoints: [from, to],
      router: L.Routing.osrmv1({
        language: 'en',
        profile: 'car'
      }),
      createMarker: function() { return null; }, // we use our own markers
      addWaypoints: false,
      routeWhileDragging: false,
      showAlternatives: false,
      fitSelectedRoutes: false, // we'll manually control fit
      lineOptions: { styles: [{ color: "#00f3ff", opacity: 0.95, weight: 6 }] },
      show: false
    }).addTo(map);

    if (window.__NAV__) window.__NAV__.routeControl = routeControl;

    routeControl.on('routesfound', function(e) {
      if (!lastFitOnce && e && e.routes && e.routes.length) {
        const route = e.routes[0];
        const bounds = L.latLngBounds(
          route.coordinates.map(c => L.latLng(c.lat, c.lng))
        );
        map.fitBounds(bounds.pad(0.2));
        lastFitOnce = true;
      }
    });

    routeControl.on('routingerror', function(err) {
      console.warn("Routing error:", err);
    });
  }

  // Map click places/moves destination
  map.on('click', function(e) {
    createDestinationMarker(e.latlng);
    updateRoute();
  });

  // <<< ADDED: helper so other modules (app.js) can set destination programmatically
  function setDestination(latlng, popupHtml) {
    const m = createDestinationMarker(latlng);
    if (popupHtml && m) {
      try {
        m.bindPopup(popupHtml).openPopup();
      } catch (e) {}
    }
    updateRoute();
    return m;
  }
  // <<< END ADDED

  // Expose destination/route control utilities to global NAV object for other modules (app.js, UI, etc.)
  window.__NAV__ = window.__NAV__ || {};
  window.__NAV__.map = map;
  window.__NAV__.markersLayer = markersLayer;
  window.__NAV__.clearMarkers = clearMarkers;
  window.__NAV__.clearDestination = clearDestination;
  // <<< EXPORTED: setDestination
  window.__NAV__.setDestination = setDestination;
  // destinationMarker and routeControl are assigned when created

  // --- EXPORT FOR APP.JS (compatibility) ---
  window.map = map;
  window.markersLayer = markersLayer;
  window.clearMarkers = clearMarkers;
})();
