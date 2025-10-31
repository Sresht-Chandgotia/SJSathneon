(function initMap() {
  // --- MAP SETUP (keep your existing code) ---
  const southWest = L.latLng(-85, -180);
  const northEast = L.latLng(85, 180);
  const worldBounds = L.latLngBounds(southWest, northEast);

  const map = L.map("map", {
    zoomControl: true,
    minZoom: 3,
    maxBounds: worldBounds,
    maxBoundsViscosity: 0.8,
    worldCopyJump: false,
    inertia: true,
  }).setView([20.5937, 78.9629], 5);

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

  // --- USER LOCATION (keep your existing code) ---
  let userMarker = null;
  let userCircle = null;
  let hasCentered = false;

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

  if (position.coords.accuracy > 100) {
    accuracyCircle.setStyle({ color: "#f87171", opacity: 0.4 }); // redish
  } else {
    accuracyCircle.setStyle({ color: "#22c55e", opacity: 0.2 }); // greenish
  }

  document.head.appendChild(style);

  function updateUserLocation(lat, lon, accuracy) {
    const latlng = L.latLng(lat, lon);
    const radius = Math.min(accuracy, 10);

    if (!userMarker) {
      const userIcon = L.divIcon({
        className: "",
        html: `<div class="pulse-dot"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      userMarker = L.marker(latlng, { icon: userIcon }).addTo(map);
    } else userMarker.setLatLng(latlng);

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

    window.__NAV__ = window.__NAV__ || {};
    window.__NAV__.userLocation = { lat: lat, lng: lon };

    // center the map on first good live location — hide "cloud" during animation
    if (!hasCentered) {
      let zoom;
      if (accuracy <= 20) zoom = 18;
      else if (accuracy <= 50) zoom = 17;
      else if (accuracy <= 150) zoom = 16;
      else zoom = 15;

      try {
        // stop any current animation to avoid jumpiness
        if (typeof map.stop === "function") map.stop();

        // compute duration based on distance (clamped)
        let duration = 1.0;
        try {
          const distMeters = map.distance(map.getCenter(), latlng);
          duration = Math.min(3.0, Math.max(1.0, distMeters / 900));
        } catch (e) {
          /* fallback */
        }

        // ---- TEMPORARILY SUPPRESS VISUALS THAT CAUSE THE "CLOUD" ----
        // 1) hide/low-opacity the accuracy circle if present
        const originalCircleStyle = userCircle
          ? {
              fillOpacity: userCircle.options.fillOpacity,
              opacity: userCircle.options.opacity,
            }
          : null;
        if (userCircle) {
          try {
            userCircle.setStyle({ fillOpacity: 0, opacity: 0 });
          } catch (e) {
            /* ignore */
          }
        }

        // 2) suppress the pulse animation on the marker DOM element if available
        let markerEl = null;
        try {
          markerEl =
            userMarker && typeof userMarker.getElement === "function"
              ? userMarker.getElement()
              : null;
          if (markerEl) {
            const dot = markerEl.querySelector(".pulse-dot");
            if (dot) dot.classList.add("no-pulse-during-fly");
          }
        } catch (e) {
          /* ignore */
        }

        // prepare restore function
        const restoreVisuals = () => {
          try {
            if (userCircle && originalCircleStyle) {
              userCircle.setStyle({
                fillOpacity: originalCircleStyle.fillOpacity,
                opacity: originalCircleStyle.opacity,
              });
            }
          } catch (e) {
            /* ignore */
          }
          try {
            if (markerEl) {
              const dot = markerEl.querySelector(".pulse-dot");
              if (dot) dot.classList.remove("no-pulse-during-fly");
            }
          } catch (e) {
            /* ignore */
          }
        };

        // listen for map movement end (fires after flyTo finishes)
        const onMoveEnd = () => {
          restoreVisuals();
          map.off("moveend", onMoveEnd);
        };
        map.on("moveend", onMoveEnd);

        // do the smooth fly
        map.flyTo(latlng, zoom, {
          animate: true,
          duration,
          easeLinearity: 0.12,
        });
      } catch (e) {
        // fallback: setView and restore visuals immediately
        try {
          map.setView(latlng, zoom);
        } catch (err) {}
        if (userCircle) {
          try {
            userCircle.setStyle({
              fillOpacity: originalCircleStyle
                ? originalCircleStyle.fillOpacity
                : 0.04,
              opacity: originalCircleStyle ? originalCircleStyle.opacity : 0.85,
            });
          } catch (err) {}
        }
        try {
          const markerEl2 =
            userMarker && typeof userMarker.getElement === "function"
              ? userMarker.getElement()
              : null;
          if (markerEl2) {
            const dot2 = markerEl2.querySelector(".pulse-dot");
            if (dot2) dot2.classList.remove("no-pulse-during-fly");
          }
        } catch (err) {}
      }

      hasCentered = true;
    }

    // update route start if route exists
    // NOTE: prefer updateRoute() which understands startMarker; easier and robust
    // update route start if route exists — prefer custom startMarker if present
    if (window.__NAV__?.routeControl && window.__NAV__?.destinationMarker) {
      try {
        const startLatLng =
          startMarker && map.hasLayer(startMarker)
            ? startMarker.getLatLng()
            : latlng;
        window.__NAV__.routeControl.setWaypoints([
          startLatLng,
          window.__NAV__.destinationMarker.getLatLng(),
        ]);
      } catch (e) {
        console.warn("Failed to update route waypoints:", e);
      }
    }
  }

  // native geolocation watch (keep yours)
  function startHighAccuracyWatch() {
    if (!navigator.geolocation) {
      console.warn("Geolocation not supported.");
      return;
    }
    navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        if (accuracy > 1000) {
          console.warn("Low accuracy detected:", accuracy);
          return;
        }
        updateUserLocation(latitude, longitude, accuracy);
      },
      (err) => {
        console.warn("Geolocation error:", err.message);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  }
  startHighAccuracyWatch();

  // ----------------------------
  // ROUTING / DESTINATION / START LOGIC (REPLACED BLOCK)
  // ----------------------------
  let destinationMarker = null;
  let startMarker = null; // new start marker
  let routeControl = null;
  let lastFitOnce = false;

  // A small state: routing profile. default 'car'
  const profileMap = { driving: "car", walking: "foot", cycling: "bike" };
  let currentMode = "driving"; // corresponds to your HUD mode buttons
  function getOsrmProfile() {
    return profileMap[currentMode] || "car";
  }

  // SNAP-TO-ROAD using OSRM nearest
  // Accepts a LatLng-like object {lat, lng} or L.LatLng
  async function snapToRoad(latlng) {
    if (!latlng) return latlng;
    const profile = getOsrmProfile();
    const lon =
      latlng.lng ??
      latlng.lon ??
      (Array.isArray(latlng) ? latlng[1] : undefined);
    const lat = latlng.lat ?? (Array.isArray(latlng) ? latlng[0] : undefined);
    if (lat === undefined || lon === undefined) return latlng;

    const url = `https://router.project-osrm.org/nearest/v1/${profile}/${lon},${lat}?number=1`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Nearest request failed");
      const data = await res.json();
      if (data && data.waypoints && data.waypoints.length) {
        const wp = data.waypoints[0];
        // waypoint location is [lon, lat]
        const snappedLat = wp.location[1];
        const snappedLon = wp.location[0];
        return L.latLng(snappedLat, snappedLon);
      }
    } catch (e) {
      console.warn("snapToRoad failed:", e);
    }
    return latlng;
  }

  // Create or move START marker (draggable)
  function createStartMarker(latlng, popupHtml) {
    const startIcon = L.divIcon({
      className: "",
      html: `<div style="width:16px;height:16px;border-radius:50%;background: #ffcc00;border:2px solid white;box-shadow:0 0 8px rgba(255,204,0,0.6)"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });

    if (!startMarker) {
      startMarker = L.marker(latlng, {
        icon: startIcon,
        draggable: true,
      }).addTo(map);
      startMarker.on("dragend", async (ev) => {
        const pos = ev.target.getLatLng();
        const snapped = await snapToRoad(pos);
        startMarker.setLatLng(snapped);
        updateRoute();
      });
    } else {
      startMarker.setLatLng(latlng);
    }

    if (popupHtml) {
      try {
        startMarker.bindPopup(popupHtml).openPopup();
      } catch (e) {}
    }

    window.__NAV__ = window.__NAV__ || {};
    window.__NAV__.startMarker = startMarker;
    updateRoute();
    return startMarker;
  }

  // Clear start marker
  function clearStartMarker() {
    if (startMarker) {
      try {
        if (map.hasLayer(startMarker)) map.removeLayer(startMarker);
      } catch (e) {}
      startMarker = null;
      if (window.__NAV__) window.__NAV__.startMarker = null;
    }
    // Recompute route (will fallback to live location)
    updateRoute();
  }

  // Create or move a custom start marker (draggable)
  function createStartMarker(latlng, popupHtml) {
    const startIcon = L.divIcon({
      className: "",
      html: `<div style="width:16px;height:16px;border-radius:50%;background:#34d399;border:2px solid white;box-shadow:0 0 8px rgba(52,211,153,0.6)"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });

    if (!startMarker) {
      startMarker = L.marker(latlng, {
        icon: startIcon,
        draggable: true,
      }).addTo(map);
      startMarker.on("dragend", async (ev) => {
        const pos = ev.target.getLatLng();
        const snapped = await snapToRoad(pos);
        startMarker.setLatLng(snapped);
        updateRoute();
      });
    } else {
      startMarker.setLatLng(latlng);
      if (!map.hasLayer(startMarker)) map.addLayer(startMarker);
    }

    if (popupHtml) {
      try {
        startMarker.bindPopup(popupHtml).openPopup();
      } catch (e) {}
    }

    window.__NAV__ = window.__NAV__ || {};
    window.__NAV__.startMarker = startMarker;

    // If a destination exists, update the route to start here
    if (window.__NAV__?.destinationMarker) updateRoute();
    return startMarker;
  }

  function clearStartMarker() {
    if (startMarker) {
      try {
        if (map.hasLayer(startMarker)) map.removeLayer(startMarker);
      } catch (e) {}
      startMarker = null;
      if (window.__NAV__) window.__NAV__.startMarker = null;
    }
    // restore route start to live user location if applicable
    if (
      window.__NAV__?.routeControl &&
      window.__NAV__?.destinationMarker &&
      userMarker
    ) {
      try {
        window.__NAV__.routeControl.setWaypoints([
          userMarker.getLatLng(),
          window.__NAV__.destinationMarker.getLatLng(),
        ]);
      } catch (e) {
        console.warn("Failed to reset route to live location:", e);
      }
    }
  }

  // Create or move destination marker (draggable)
  function createDestinationMarker(latlng, popupHtml) {
    const destIcon = L.divIcon({
      className: "",
      html: `<div class="destination-pin"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });

    if (!destinationMarker) {
      destinationMarker = L.marker(latlng, {
        icon: destIcon,
        draggable: true,
      }).addTo(map);
      // on dragend: snap to road, then update route
      destinationMarker.on("dragend", async (ev) => {
        const pos = ev.target.getLatLng();
        const snapped = await snapToRoad(pos);
        destinationMarker.setLatLng(snapped);
        updateRoute();
      });
    } else {
      destinationMarker.setLatLng(latlng);
    }

    if (popupHtml) {
      try {
        destinationMarker.bindPopup(popupHtml).openPopup();
      } catch (e) {}
    }

    window.__NAV__ = window.__NAV__ || {};
    window.__NAV__.destinationMarker = destinationMarker;
    updateRoute();
    return destinationMarker;
  }

  // Clear destination
  function clearDestination() {
    if (destinationMarker) {
      try {
        if (map.hasLayer(destinationMarker)) map.removeLayer(destinationMarker);
      } catch (e) {}
      destinationMarker = null;
      if (window.__NAV__) window.__NAV__.destinationMarker = null;
    }
    if (routeControl) {
      try {
        map.removeControl(routeControl);
      } catch (e) {}
      routeControl = null;
      if (window.__NAV__) window.__NAV__.routeControl = null;
    }
    lastFitOnce = false;
    // also clear route info in HUD (if present)
    const distEl = document.getElementById("routeDistance");
    const etaEl = document.getElementById("routeEta");
    if (distEl) distEl.textContent = "—";
    if (etaEl) etaEl.textContent = "—";
  }

  // Update route — prefer explicit startMarker, else use live userMarker
  // ---------- REPLACEMENT updateRoute() (robust to missing modeSpeeds) ----------
  function updateRoute() {
    if (!destinationMarker || !userMarker) {
      if (routeControl) {
        try {
          map.removeControl(routeControl);
        } catch (e) {}
        routeControl = null;
        if (window.__NAV__) window.__NAV__.routeControl = null;
      }
      // clear HUD when no route
      const distEl = document.getElementById("routeDistance");
      const etaEl = document.getElementById("routeEta");
      if (distEl) distEl.textContent = "—";
      if (etaEl) etaEl.textContent = "—";
      return;
    }

    const from =
      startMarker && map.hasLayer(startMarker)
        ? startMarker.getLatLng()
        : userMarker.getLatLng();

    const to = destinationMarker.getLatLng();

    // Remove old route control so we can recreate with new style/profile
    if (routeControl) {
      try {
        map.removeControl(routeControl);
      } catch (e) {
        console.warn(e);
      }
      routeControl = null;
      if (window.__NAV__) window.__NAV__.routeControl = null;
    }

    // Fallback speeds/styles if modeSpeeds isn't defined (prevents ReferenceError)
    const defaultModeSpeeds = {
      driving: {
        speedKmph: 18,
        style: { weight: 7, dashArray: null, color: "#00f3ff", opacity: 0.98 },
      },
      walking: {
        speedKmph: 5,
        style: { weight: 4, dashArray: "8,6", color: "#66cc66", opacity: 0.9 },
      },
      cycling: {
        speedKmph: 14,
        style: {
          weight: 5,
          dashArray: "2,10",
          color: "#ff6b97ff",
          opacity: 0.95,
        },
      },
    };

    // Use either the declared modeSpeeds or fallback
    const speeds =
      typeof modeSpeeds !== "undefined" && modeSpeeds
        ? modeSpeeds
        : defaultModeSpeeds;

    // Mode-specific style (defaults if not present)
    const styleCfg = (speeds[currentMode] && speeds[currentMode].style) || {};
    // Provide sensible defaults
    const color =
      styleCfg.color ||
      (currentMode === "walking"
        ? "#66cc66"
        : currentMode === "cycling"
        ? "#ffb86b"
        : "#00f3ff");
    const weight =
      styleCfg.weight ||
      (currentMode === "walking" ? 4 : currentMode === "cycling" ? 5 : 6);
    const dashArray =
      styleCfg.dashArray ??
      (currentMode === "walking"
        ? "6,6"
        : currentMode === "cycling"
        ? "2,8"
        : null);
    const opacity = styleCfg.opacity ?? 0.95;

    // Create routeControl with mode-specific lineOptions
    routeControl = L.Routing.control({
      waypoints: [from, to],
      router: L.Routing.osrmv1({
        profile: getOsrmProfile(),
      }),
      createMarker: function () {
        return null;
      }, // use your own markers
      addWaypoints: false,
      routeWhileDragging: false,
      showAlternatives: false,
      fitSelectedRoutes: false,
      lineOptions: {
        // LRM accepts an array of style objects (first is topmost)
        styles: [
          {
            color: color,
            opacity: opacity,
            weight: weight,
            dashArray: dashArray,
          },
        ],
      },
      show: false,
    }).addTo(map);

    if (window.__NAV__) window.__NAV__.routeControl = routeControl;

    // When route found: compute distance & ETA client-side and fit once
    routeControl.on("routesfound", function (e) {
      try {
        const r = e && e.routes && e.routes[0] ? e.routes[0] : null;
        if (!r) {
          const distEl = document.getElementById("routeDistance");
          const etaEl = document.getElementById("routeEta");
          if (distEl) distEl.textContent = "—";
          if (etaEl) etaEl.textContent = "—";
          return;
        }

        // Extract distance robustly
        let meters = null;
        if (typeof r.distance === "number") meters = r.distance;
        else if (r.summary && typeof r.summary.totalDistance === "number")
          meters = r.summary.totalDistance;
        else if (Array.isArray(r.legs)) {
          try {
            meters = r.legs.reduce((s, leg) => s + (leg.distance || 0), 0);
          } catch (err) {
            meters = null;
          }
        }

        if (meters == null || Number.isNaN(meters)) {
          meters = 0;
          if (r.coordinates && r.coordinates.length > 1) {
            for (let i = 1; i < r.coordinates.length; i++) {
              const a = r.coordinates[i - 1],
                b = r.coordinates[i];
              if (a && b)
                meters += map.distance([a.lat, a.lng], [b.lat, b.lng]);
            }
          }
        }

        // Compute ETA client-side using speeds (use speeds[currentMode] fallback)
        const speedKmph =
          (speeds[currentMode] && speeds[currentMode].speedKmph) || 45;
        const speedMps = (speedKmph * 1000) / 3600;
        let seconds = null;
        if (meters != null && !Number.isNaN(meters) && speedMps > 0)
          seconds = Math.round(meters / speedMps);

        // Update HUD
        const distEl = document.getElementById("routeDistance");
        const etaEl = document.getElementById("routeEta");
        if (distEl) {
          if (meters < 1000) distEl.textContent = `${Math.round(meters)} m`;
          else distEl.textContent = `${(meters / 1000).toFixed(2)} km`;
        }
        if (etaEl) {
          if (seconds != null)
            etaEl.textContent = `${Math.round(seconds / 60)} min`;
          else etaEl.textContent = "—";
        }

        // Fit bounds once to avoid jarring jumps
        if (!lastFitOnce && r.coordinates && r.coordinates.length) {
          try {
            const bounds = L.latLngBounds(
              r.coordinates.map((c) => L.latLng(c.lat, c.lng))
            );
            map.fitBounds(bounds.pad(0.18));
            lastFitOnce = true;
          } catch (err) {
            /* noop */
          }
        }
      } catch (err) {
        console.warn("Error processing route:", err);
      }
    });

    routeControl.on("routingerror", function (err) {
      console.warn("Routing error:", err);
      const distEl = document.getElementById("routeDistance");
      const etaEl = document.getElementById("routeEta");
      if (distEl) distEl.textContent = "—";
      if (etaEl) etaEl.textContent = "—";
    });
  }
  // ---------- end replacement ----------

  // setRoutingMode remains same but calls updateRoute
  function setRoutingMode(mode) {
    if (!mode) return;
    if (!["driving", "walking", "cycling"].includes(mode)) return;
    currentMode = mode;

    // Recreate route with new visual options and recompute ETA client-side
    if (destinationMarker) {
      if (routeControl) {
        try {
          map.removeControl(routeControl);
        } catch (e) {
          console.warn(e);
        }
        routeControl = null;
        if (window.__NAV__) window.__NAV__.routeControl = null;
      }
      lastFitOnce = false;
      updateRoute(); // this will compute ETA using the chosen mode speed
    }
  }

  // On map click: snap first, then create/move destination marker and update route
  map.on("click", async (e) => {
    const initial = e.latlng;

    // Give immediate UI feedback: show a tiny temporary marker (optional)
    // const temp = L.circleMarker(initial, { radius: 6, color: '#888', opacity: 0.6 }).addTo(map);
    // setTimeout(() => map.removeLayer(temp), 1200);

    try {
      // Snap to road first (may return same point if snapping fails)
      const snapped = await snapToRoad(initial);

      if (snapped) {
        // Create or move destination marker only after snapping
        createDestinationMarker(snapped);
        // Ensure the marker position is set to snapped in case createDestinationMarker reused
        if (destinationMarker) destinationMarker.setLatLng(snapped);
      } else {
        // fallback: put marker at clicked location
        createDestinationMarker(initial);
        if (destinationMarker) destinationMarker.setLatLng(initial);
      }

      // Now update route once
      updateRoute();
    } catch (err) {
      console.warn("Error handling map click destination:", err);
      // fallback behavior
      createDestinationMarker(initial);
      updateRoute();
    }
  });

  // Programmatic setDestination — used by search
  async function setDestination(latlngLike, popupHtml) {
    const latlng = L.latLng(
      latlngLike.lat ?? latlngLike[0],
      latlngLike.lng ?? latlngLike[1] ?? latlngLike.lon
    );

    try {
      // Snap first (gives best routing results)
      const snapped = await snapToRoad(latlng);

      const finalLatLng = snapped || latlng;

      // Create/move marker only after snap result
      createDestinationMarker(finalLatLng, popupHtml);

      // Ensure marker is at snapped location
      if (destinationMarker) destinationMarker.setLatLng(finalLatLng);

      // Now compute the route based on the snapped marker
      updateRoute();

      return destinationMarker;
    } catch (err) {
      console.warn("setDestination failed snapping:", err);
      // fallback: create marker at requested location and update route
      createDestinationMarker(latlng, popupHtml);
      updateRoute();
      return destinationMarker;
    }
  }

  // Expose functions to the rest of the app (added start functions)
  window.__NAV__ = window.__NAV__ || {};
  window.__NAV__.map = map;
  window.__NAV__.markersLayer = markersLayer;
  window.__NAV__.clearMarkers = clearMarkers;
  window.__NAV__.destinationMarker = destinationMarker;
  window.__NAV__.routeControl = routeControl;
  window.__NAV__.setDestination = setDestination;
  window.__NAV__.clearDestination = clearDestination;
  window.__NAV__.setRoutingMode = setRoutingMode;
  window.__NAV__.createStartMarker = createStartMarker; // new
  window.__NAV__.clearStartMarker = clearStartMarker; // new
  window.__NAV__.startMarker = startMarker; // helpful reference

  // ----------------------------
  // ALWAYS-ON TRAFFIC OVERLAY
  // ----------------------------
  const trafficLayer = L.tileLayer(
    "https://{s}.tile.opentrafficmap.org/traffic/{z}/{x}/{y}.png",
    {
      attribution: "&copy; OpenTrafficMap contributors",
      maxZoom: 19,
      opacity: 0.8,
    }
  );
  trafficLayer.addTo(map);

  window.__NAV__._getCurrentMode = () => currentMode;

  // keep original compatibility names
  window.map = map;
  window.markersLayer = markersLayer;
  window.clearMarkers = clearMarkers;
})();
