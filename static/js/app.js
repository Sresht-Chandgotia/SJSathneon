document.addEventListener("DOMContentLoaded", () => {
  // --- HUD / SIDEBAR LOGIC ---
  const hud = document.getElementById("hud");
  const btnOpen = document.getElementById("hudToggle");
  const btnClose = document.getElementById("hudClose");
  const statusText = document.getElementById("statusText");

  if (statusText) statusText.textContent = "HUD Online";

  function setExpanded(expanded) {
    if (!hud) return;
    hud.classList.toggle("expanded", expanded);
    if (btnOpen) btnOpen.setAttribute("aria-expanded", String(expanded));
    const map = window.__NAV__?.map;
    if (map) setTimeout(() => map.invalidateSize(), 320);
  }

  btnOpen?.addEventListener("click", () => setExpanded(true));
  btnClose?.addEventListener("click", () => setExpanded(false));

  document.querySelectorAll(".rail-icon").forEach((el) => {
    el.addEventListener("click", () => setExpanded(true));
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setExpanded(false);
  });

  window.addEventListener("resize", () => {
    const map = window.__NAV__?.map;
    if (map) map.invalidateSize();
  });

  // --- SEARCH BAR FUNCTIONALITY ---
  const searchInput = document.getElementById("search");

  if (searchInput) {
    searchInput.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (!query) return showPopup("Please type a location to search!");
        await searchPlace(query);
      }
    });
  }

  async function searchPlace(query) {
    const map = window.__NAV__?.map;
    const markersLayer = window.__NAV__?.markersLayer;
    const clearMarkers = window.__NAV__?.clearMarkers;

    if (!map || !markersLayer || !clearMarkers) {
      console.error("Map not initialized yet.");
      showPopup("Map is still loading. Try again in a moment!");
      return;
    }

    showPopup(`Searching for "${query}"...`);

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
        query
      )}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!data || data.length === 0) {
        showPopup("No results found!");
        return;
      }

      const place = data[0];
      const lat = parseFloat(place.lat);
      const lon = parseFloat(place.lon);

      // keep clearing any previous simple markers (but not the destination pin)
      // if you want to also clear the destination on new searches, call window.__NAV__.clearDestination()
      clearMarkers();

      // Use the same destination marker (so click-created marker and search-created marker are identical)
      if (window.__NAV__ && typeof window.__NAV__.setDestination === "function") {
        const popupHtml = `<strong>${place.display_name}</strong>`;
        // setDestination accepts an object/LatLng
        window.__NAV__.setDestination({ lat, lng: lon }, popupHtml);

        // center map to the searched place
        map.setView([lat, lon], 15);

        showPopup(`Showing results for "${query}"`);
        return;
      }

      // fallback (shouldn't happen) — create simple marker in markersLayer
      L.marker([lat, lon])
        .addTo(markersLayer)
        .bindPopup(`<strong>${place.display_name}</strong>`)
        .openPopup();

      map.setView([lat, lon], 15);
      showPopup(`Showing results for "${query}"`);
    } catch (err) {
      console.error("Search failed:", err);
      showPopup("Error while searching. Check console for details.");
    }
  }


  // --- CATEGORY SEARCH + POPUPS ---
  const categoryButtons = document.querySelectorAll(".chip");

  // Create popup once
  const popupBox = document.createElement("div");
  popupBox.id = "hud-popup";
  Object.assign(popupBox.style, {
    position: "fixed",
    bottom: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(30, 58, 138, 0.9)",
    color: "white",
    padding: "10px 18px",
    borderRadius: "8px",
    fontFamily: "Inter, sans-serif",
    fontSize: "14px",
    display: "none",
    zIndex: "1000",
    boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
    transition: "opacity 0.3s ease",
  });
  document.body.appendChild(popupBox);

  function showPopup(message, duration = 2500) {
    popupBox.textContent = message;
    popupBox.style.display = "block";
    popupBox.style.opacity = "1";
    setTimeout(() => {
      popupBox.style.opacity = "0";
      setTimeout(() => (popupBox.style.display = "none"), 300);
    }, duration);
  }

  categoryButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const map = window.__NAV__?.map;
      if (!map) return showPopup("Map not ready yet!");
      const category = btn.dataset.cat;
      const center = map.getCenter();
      await findNearby(category, center.lat, center.lng);
    });
  });

  async function findNearby(type, lat, lon) {
    const map = window.__NAV__?.map;
    const markersLayer = window.__NAV__?.markersLayer;
    const clearMarkers = window.__NAV__?.clearMarkers;
    if (!map || !markersLayer || !clearMarkers) return;

    clearMarkers();
    showPopup(`Searching nearby ${type}s...`);

    let tag = "";
    if (type === "hospital") tag = "amenity=hospital";
    else if (type === "atm") tag = "amenity=atm";
    else if (type === "fuel") tag = "amenity=fuel";

    let radius = 3000; // default 3 km
    const zoom = map.getZoom();
    if (zoom >= 15) radius = 1500;
    else if (zoom >= 13) radius = 2500;
    else if (zoom >= 10) radius = 4000;

    const overpassUrl = `https://overpass-api.de/api/interpreter?data=[out:json][timeout:25];
      node[${tag}](around:${radius},${lat},${lon});
      out;`;

    try {
      const res = await fetch(overpassUrl);
      const data = await res.json();

      if (!data.elements || data.elements.length === 0) {
        showPopup(
          `No ${type}s found within ${(radius / 1000).toFixed(1)} km`,
          4000
        );
        return;
      }

      data.elements.forEach((el) => {
        if (el.lat && el.lon) {
          L.marker([el.lat, el.lon])
            .addTo(markersLayer)
            .bindPopup(
              `<strong>${
                el.tags.name || type.toUpperCase()
              }</strong><br>${type}`
            );
        }
      });

      showPopup(
        `Found ${data.elements.length} ${type}(s) within ${(
          radius / 1000
        ).toFixed(1)} km`,
        4000
      );
    } catch (err) {
      console.error(err);
      showPopup("Error fetching data. Please try again later.", 4000);
    }
  }

  // ==========================
// CLEAR DESTINATION BUTTON
// ==========================
const clearDestBtn = document.getElementById("clearDestinationBtn");
if (clearDestBtn) {
  clearDestBtn.addEventListener("click", () => {
    // Use map.js clearDestination() if available
    if (window.__NAV__ && typeof window.__NAV__.clearDestination === "function") {
      window.__NAV__.clearDestination();
      showPopup("Destination removed");
    } else {
      // fallback safety
      try {
        const map = window.__NAV__?.map;
        if (window.__NAV__?.destinationMarker && map) {
          if (map.hasLayer(window.__NAV__.destinationMarker)) map.removeLayer(window.__NAV__.destinationMarker);
          window.__NAV__.destinationMarker = null;
        }
        if (window.__NAV__?.routeControl && map) {
          map.removeControl(window.__NAV__.routeControl);
          window.__NAV__.routeControl = null;
        }
        showPopup("Destination removed");
      } catch (e) {
        console.warn("Could not clear destination:", e);
        showPopup("Unable to remove destination (check console).");
      }
    }
  });
}
 
const modeButtons = document.querySelectorAll(".mode-btn");
  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      modeButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      if (window.__NAV__ && typeof window.__NAV__.setRoutingMode === "function") {
        window.__NAV__.setRoutingMode(mode);
        showPopup(`Mode: ${mode}`, 1200);
      } else {
        showPopup(`Mode changed to ${mode}`, 1200);
      }
    });
  });
  
});

//Nav bar upgrade
const hud = document.querySelector(".hud");
const hudToggle = document.getElementById("hudToggle");
const hudClose = document.getElementById("hudClose");

hudToggle.addEventListener("click", () => {
  hud.classList.add("expanded");
  document.body.classList.add("hud-open"); // 👈 Add this line
});

hudClose.addEventListener("click", () => {
  hud.classList.remove("expanded");
  document.body.classList.remove("hud-open"); // 👈 Add this line
});
