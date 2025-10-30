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

  // NOTE: the old simple Enter handler was removed and replaced by the
  // advanced autocomplete below (it still calls searchPlace(query) when Enter
  // is pressed with no focused suggestion).

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

  // small helper: escape HTML for safe popups
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

/* ----------------------
   Favorites helpers
   ---------------------- */
const FAV_KEY = "navhud:favorites";

function getFavorites() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); }
  catch (e) { return []; }
}
function saveFavorites(list) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(list || [])); } catch (e) {}
}
function isFavorite(poi) {
  const favs = getFavorites();
  return favs.some(f => f.id === poi.id && f.type === poi.type);
}
function toggleFavorite(poi) {
  const favs = getFavorites();
  const idx = favs.findIndex(f => f.id === poi.id && f.type === poi.type);
  if (idx >= 0) {
    favs.splice(idx, 1);
    saveFavorites(favs);
    return false;
  } else {
    favs.push({
      id: poi.id,
      type: poi.type,
      lat: poi.lat,
      lon: poi.lon,
      name: poi.tags?.name || poi.name || ""
    });
    saveFavorites(favs);
    return true;
  }
}

// Add a POI object to favorites (id,type,lat,lon,tags,name optional)
function addFavoriteFromPOI(poi) {
  // make sure shape matches storage expectations
  const obj = {
    id: poi.id ?? `${poi.type || 'poi'}:${(poi.lat||'')},${(poi.lon||'')}`,
    type: poi.type || (poi.tags && (poi.tags.amenity || poi.tags.shop)) || 'place',
    lat: Number(poi.lat),
    lon: Number(poi.lon),
    name: poi.tags?.name || poi.name || poi.display_name || ''
  };
  // toggleFavorite uses same shape (id + type)
  const nowFav = toggleFavorite(obj);
  // refresh UI
  renderFavorites?.();
  return nowFav;
}



// Robust findNearby with lightweight-first queries, retries, and endpoint fallbacks
async function findNearby(type, lat, lon) {
  const map = window.__NAV__?.map;
  const markersLayer = window.__NAV__?.markersLayer;
  const clearMarkers = window.__NAV__?.clearMarkers;
  if (!map || !markersLayer || !clearMarkers) return;

  clearMarkers();
  showPopup(`Searching nearby ${type}s...`);

  const categoryTagMap = {
    hospital: ["amenity=hospital"],
    atm: ["amenity=atm"],
    fuel: ["amenity=fuel","shop=fuel"],
    restaurant: ["amenity=restaurant"],
    cafe: ["amenity=cafe"],
    pharmacy: ["amenity=pharmacy"],
    supermarket: ["shop=supermarket","amenity=supermarket"],
    parking: ["amenity=parking"],
  };
  const tagFilters = categoryTagMap[type] || [];
  if (tagFilters.length === 0) {
    showPopup(`Unknown category: ${type}`, 2500);
    return;
  }

  // Choose radius by zoom (conservative if low zoom)
  let radius = 3000;
  const zoom = map.getZoom();
  if (zoom >= 15) radius = 1200;
  else if (zoom >= 13) radius = 2200;
  else if (zoom >= 10) radius = 3500;
  // cap radius to avoid massive queries
  radius = Math.min(radius, 5000);

  // Overpass endpoints to try (primary first, then mirrors)
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter"
  ];

  // Build a simple nodes-only query for the first attempt (cheaper)
  function buildNodesOnlyQuery(tags) {
    const parts = tags.map(t => {
      const [k,v] = t.split("=");
      return `node[${k}=${v}](around:${radius},${lat},${lon});`;
    }).join("\n");
    return `[out:json][timeout:25];\n${parts}\nout;`;
  }

  // Build full query with node/way/relation center (heavier)
  function buildFullQuery(tags) {
    const parts = tags.map(t => {
      const [k,v] = t.split("=");
      return `node[${k}=${v}](around:${radius},${lat},${lon});
              way[${k}=${v}](around:${radius},${lat},${lon});
              relation[${k}=${v}](around:${radius},${lat},${lon});`;
    }).join("\n");
    // out center will include .center for ways/relations
    return `[out:json][timeout:45];\n${parts}\nout center;`;
  }

  // small helper to perform fetch with abort timeout
  async function fetchWithTimeout(url, body, timeoutMs = 20000) {
    const ac = new AbortController();
    const id = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method: "POST", body, signal: ac.signal, headers: { "Content-Type": "application/x-www-form-urlencoded", "Referer": window.location.origin } });
      clearTimeout(id);
      return res;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  // Try endpoints sequentially. First, attempt nodes-only (fast). If nothing or error,
  // try full query on same endpoint. Move to next endpoint if it fails / times out.
  let responseJson = null;
  let usedQueryType = null;
  let usedEndpoint = null;

  for (let epIdx = 0; epIdx < endpoints.length; epIdx++) {
    const endpoint = endpoints[epIdx];
    // try nodes-only first
    const nodeQuery = buildNodesOnlyQuery(tagFilters);
    try {
      usedEndpoint = endpoint;
      usedQueryType = "nodes";
      const res = await fetchWithTimeout(endpoint, `data=${encodeURIComponent(nodeQuery)}`, 20000);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data.elements) && data.elements.length > 0) {
        responseJson = data;
        break; // success
      }
      // if nodes-only returned nothing, try full query on same endpoint
    } catch (err) {
      console.warn(`Overpass nodes-only failed @ ${endpoint}:`, err);
      // fallthrough to try full query on same endpoint
    }

    // full query attempt
    try {
      usedQueryType = "full";
      const fullQuery = buildFullQuery(tagFilters);
      const res2 = await fetchWithTimeout(endpoint, `data=${encodeURIComponent(fullQuery)}`, 35000);
      if (!res2.ok) throw new Error(`Status ${res2.status}`);
      const data2 = await res2.json();
      if (Array.isArray(data2.elements) && data2.elements.length > 0) {
        responseJson = data2;
        break; // success
      } else {
        console.warn(`Overpass full query returned no elements @ ${endpoint}`);
      }
    } catch (err) {
      console.warn(`Overpass full query failed @ ${endpoint}:`, err);
    }

    // If we reach here, this endpoint didn't return results; try the next one.
    // small backoff before next endpoint
    await new Promise((r) => setTimeout(r, 700 + (epIdx * 300)));
  }

  if (!responseJson || !Array.isArray(responseJson.elements)) {
    console.error("Overpass/search error: All endpoints failed or returned no results.");
    showPopup("No results or Overpass overloaded. Try again in a bit.", 4000);
    return;
  }

  // Convert elements into items with lat/lon (use .center for way/relation)
  const items = responseJson.elements
    .map(el => {
      let elLat = el.lat, elLon = el.lon;
      if ((el.type === "way" || el.type === "relation") && el.center) {
        elLat = el.center.lat;
        elLon = el.center.lon;
      }
      return {
        id: el.id,
        type: el.type,
        lat: elLat,
        lon: elLon,
        tags: el.tags || {},
      };
    })
    .filter(it => it.lat && it.lon);

  if (items.length === 0) {
    showPopup(`No ${type}s found within ${(radius/1000).toFixed(1)} km`, 4000);
    return;
  }

  // Compute distance and sort
  items.forEach(it => {
    try { it.distance = map.distance([lat, lon], [it.lat, it.lon]); }
    catch (e) { it.distance = null; }
  });
  items.sort((a, b) => {
    if (a.distance == null && b.distance == null) return 0;
    if (a.distance == null) return 1;
    if (b.distance == null) return -1;
    return a.distance - b.distance;
  });

  // limit results
  const maxResults = 12;
  const toShow = items.slice(0, maxResults);

  // Add markers + click handler to set destination
    // Render markers (with favorite + go behavior) using helper
  renderNearbyItems(toShow, type, lat, lon);


  showPopup(`Found ${items.length} ${type}(s). Showing closest ${toShow.length}.`, 3500);
}

// renderNearbyItems: draws markers for an array of items and wires favorite / go behaviour
function renderNearbyItems(items, categoryType, centerLat, centerLon) {
  const map = window.__NAV__?.map;
  const markersLayer = window.__NAV__?.markersLayer;
  if (!map || !markersLayer) return;

  // compute distances (ensure data has them)
  items.forEach(it => {
    try { it.distance = map.distance([centerLat, centerLon], [it.lat, it.lon]); } catch (e) { it.distance = null; }
  });

  items.sort((a,b) => (a.distance||Infinity) - (b.distance||Infinity));
  const maxResults = 12;
  const toShow = items.slice(0, maxResults);

  toShow.forEach((it, idx) => {
    const name = it.tags && it.tags.name ? it.tags.name : (it.tags?.operator || categoryType.toUpperCase());
    const distText = (it.distance == null) ? "" : (it.distance < 1000 ? `${Math.round(it.distance)} m` : `${(it.distance/1000).toFixed(2)} km`);
    const fav = isFavorite(it);
    const favLabel = fav ? "★ Favorited" : "☆ Favorite";

    const popupHtml = `<div style="min-width:170px">
      <strong>${escapeHtml(name)}</strong><br/>
      <small style="color:#888">${escapeHtml(categoryType)}${distText ? ` — ${distText}` : ""}</small>
      <div style="margin-top:8px; display:flex; gap:8px; align-items:center;">
        <button data-action="goto" data-lat="${it.lat}" data-lon="${it.lon}" class="chip">Go</button>
        <button data-action="fav" data-id="${escapeHtml(it.id)}" class="chip">${favLabel}</button>
      </div>
    </div>`;

    const marker = L.marker([it.lat, it.lon]).addTo(markersLayer);
    marker.bindPopup(popupHtml);

    marker.on("popupopen", (ev) => {
      const popupEl = ev.popup.getElement();
      if (!popupEl) return;

      const gotoBtn = popupEl.querySelector('button[data-action="goto"]');
      if (gotoBtn) gotoBtn.addEventListener("click", async () => {
        try {
          if (window.__NAV__?.setDestination) {
            await window.__NAV__.setDestination({ lat: it.lat, lng: it.lon }, `<strong>${escapeHtml(name)}</strong>`);
            window.__NAV__.map.setView([it.lat, it.lon], 15);
          } else {
            marker.openPopup();
          }
        } catch (e) { console.warn(e); marker.openPopup(); }
      });

      const favBtn = popupEl.querySelector('button[data-action="fav"]');
if (favBtn) favBtn.addEventListener("click", (e) => {
  const nowFav = addFavoriteFromPOI(it);
  favBtn.textContent = nowFav ? "★ Favorited" : "☆ Favorite";
  // keep popup open or close as you prefer; here we keep it open
});

    });

    if (idx === 0) marker.openPopup();
  });
}




  // ==============================
  // Advanced Search + Autocomplete
  // ==============================
  // This block replaces the simple Enter-key search and provides suggestions, keyboard navigation,
  // debounce + abort, caching, and uses window.__NAV__.setDestination(...) when a suggestion is chosen.
  (function setupAdvancedSearch() {
    const searchInput = document.getElementById("search");
    if (!searchInput) return;

    // Wrap search input in container to position dropdown
    let wrapper = searchInput.parentElement;
    if (!wrapper.classList.contains("hud-search-wrapper")) {
      const w = document.createElement("div");
      w.className = "hud-search-wrapper";
      searchInput.parentElement.insertBefore(w, searchInput);
      w.appendChild(searchInput);
      wrapper = w;
    }

    const list = document.createElement("div");
    list.className = "autocomplete-list";
    list.style.display = "none";
    wrapper.appendChild(list);

    const loadingNode = document.createElement("div");
    loadingNode.className = "autocomplete-loading";
    loadingNode.textContent = "Searching...";
    const emptyNode = document.createElement("div");
    emptyNode.className = "autocomplete-empty";
    emptyNode.textContent = "No results";

    let debounceTimer = null;
    let lastQuery = "";
    let abortController = null;
    const cache = new Map();
    let focusedIndex = -1;
    let currentSuggestions = [];

    function showList() { list.style.display = ""; }
    function hideList() { list.style.display = "none"; focusedIndex = -1; updateSelection(); }

    function renderSuggestions(items) {
      list.innerHTML = "";
      if (!items || items.length === 0) {
        list.appendChild(emptyNode);
        showList();
        return;
      }
      items.forEach((it, idx) => {
        const el = document.createElement("div");
        el.className = "autocomplete-item";
        el.setAttribute("role", "option");
        el.setAttribute("data-idx", idx);
        el.tabIndex = -1;

        const title = document.createElement("div");
        title.className = "autocomplete-title";
        title.innerHTML = it.display_name.split(",")[0];
        const sub = document.createElement("div");
        sub.className = "autocomplete-sub";
        sub.textContent = it.address ? composeAddress(it.address) : (it.display_name || "");
        el.appendChild(title);
        el.appendChild(sub);

        el.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          chooseSuggestion(idx);
        });

        list.appendChild(el);
      });
      showList();
    }

    function updateSelection() {
      const children = Array.from(list.querySelectorAll(".autocomplete-item"));
      children.forEach((c, i) => {
        c.setAttribute("aria-selected", String(i === focusedIndex));
        if (i === focusedIndex) c.scrollIntoView({ block: "nearest", behavior: "auto" });
      });
    }

    function composeAddress(addrObj) {
      const parts = [];
      if (addrObj.road) parts.push(addrObj.road);
      if (addrObj.suburb) parts.push(addrObj.suburb);
      if (addrObj.city) parts.push(addrObj.city);
      else if (addrObj.town) parts.push(addrObj.town);
      else if (addrObj.village) parts.push(addrObj.village);
      if (addrObj.state && parts.indexOf(addrObj.state) === -1) parts.push(addrObj.state);
      if (addrObj.country) parts.push(addrObj.country);
      return parts.join(", ");
    }

      async function fetchSuggestions(query) {
  if (!query || query.length < 2) return [];

  // cancel previous request
  if (abortController) {
    try { abortController.abort(); } catch (e) {}
  }
  abortController = new AbortController();
  const signal = abortController.signal;

  // Use a slightly larger limit so we can pick the closest among more candidates
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=10&q=${encodeURIComponent(query)}&accept-language=en`;

  try {
    list.innerHTML = "";
    list.appendChild(loadingNode);
    showList();

    const res = await fetch(url, { signal, headers: { "Referer": window.location.origin } });
    if (!res.ok) throw new Error("Fetch failed");
    const data = await res.json();
    const rawItems = (Array.isArray(data) ? data : []).map(d => ({
      display_name: d.display_name,
      lat: parseFloat(d.lat),
      lon: parseFloat(d.lon),
      address: d.address || null,
      type: d.type || null
    }));

    // Compute distances relative to the current live location each time (don't cache distances)
    const map = window.__NAV__?.map;
    // Prefer explicit live location from map module if available
    let liveLatLng = null;
    if (window.__NAV__?.userLocation) {
      liveLatLng = L.latLng(window.__NAV__.userLocation.lat, window.__NAV__.userLocation.lng);
    } else if (map) {
      liveLatLng = map.getCenter();
    }

    const itemsWithDistance = rawItems.map(it => {
      let distance = null;
      if (liveLatLng && !Number.isNaN(it.lat) && !Number.isNaN(it.lon)) {
        try {
          distance = L.latLng(it.lat, it.lon).distanceTo(liveLatLng); // meters
        } catch (e) { distance = null; }
      }
      return Object.assign({}, it, { distance });
    });

    // Sort by computed distance (closest first); null distances go to the end
    itemsWithDistance.sort((a, b) => {
      if (a.distance == null && b.distance == null) return 0;
      if (a.distance == null) return 1;
      if (b.distance == null) return -1;
      return a.distance - b.distance;
    });

    // (Optional) cache rawItems keyed by query if you want to avoid refetching,
    // but do NOT cache distances. If you prefer caching, use:
    // cache.set(query, rawItems);

    return itemsWithDistance;
  } catch (err) {
    if (err.name === "AbortError") return [];
    console.warn("Autocomplete fetch error:", err);
    return [];
  }
}



    async function onInputChanged(e) {
      const q = (e.target.value || "").trim();
      lastQuery = q;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (!q || q.length < 2) {
        hideList();
        return;
      }
      debounceTimer = setTimeout(async () => {
        const items = await fetchSuggestions(q);
        if (lastQuery !== q) return;
        currentSuggestions = items;
        focusedIndex = -1;
        renderSuggestions(items);
      }, 300);
    }

    async function chooseSuggestion(idx) {
      const item = currentSuggestions[idx];
      if (!item) return;
      searchInput.value = item.display_name;
      hideList();

      if (window.__NAV__ && typeof window.__NAV__.setDestination === "function") {
        try {
          await window.__NAV__.setDestination({ lat: item.lat, lng: item.lon }, `<strong>${escapeHtml(item.display_name)}</strong>`);
          const m = window.__NAV__.map;
          if (m) m.setView([item.lat, item.lon], 15);
        } catch (err) {
          console.warn("Failed to set destination from search:", err);
        }
      } else {
        try {
          // create a small poi object and save
          const poi = { id: `search:${Date.now()}`, type: item.type || 'search', lat: item.lat, lon: item.lon, name: item.display_name };
          addFavoriteFromPOI(poi);
          showPopup("Added to favorites", 1600);

          const m = window.__NAV__?.map;
          const markers = window.__NAV__?.markersLayer;
          if (markers) {
            L.marker([item.lat, item.lon]).addTo(markers).bindPopup(`<strong>${escapeHtml(item.display_name)}</strong>`).openPopup();
          } else if (m) {
            L.marker([item.lat, item.lon]).addTo(m).bindPopup(`<strong>${escapeHtml(item.display_name)}</strong>`).openPopup();
            m.setView([item.lat, item.lon], 15);
          }
        } catch (e) { console.warn(e); }
      }
    }

    searchInput.addEventListener("keydown", (ev) => {
      const key = ev.key;
      if (list.style.display === "none") {
        // If no suggestion list, allow default handling; e.g., Enter -> full search
        if (key === "Enter") {
          ev.preventDefault();
          const q = (searchInput.value || "").trim();
          if (q.length > 0) {
            if (typeof searchPlace === "function") searchPlace(q);
          }
        }
        return;
      }
      if (key === "ArrowDown") {
        ev.preventDefault();
        if (currentSuggestions.length === 0) return;
        focusedIndex = Math.min(currentSuggestions.length - 1, focusedIndex + 1);
        updateSelection();
      } else if (key === "ArrowUp") {
        ev.preventDefault();
        if (currentSuggestions.length === 0) return;
        focusedIndex = Math.max(0, focusedIndex - 1);
        updateSelection();
      } else if (key === "Enter") {
        if (focusedIndex >= 0 && focusedIndex < currentSuggestions.length) {
          ev.preventDefault();
          chooseSuggestion(focusedIndex);
        } else {
          ev.preventDefault();
          const q = (searchInput.value || "").trim();
          if (q.length > 0) {
            if (typeof searchPlace === "function") searchPlace(q);
          }
        }
      } else if (key === "Escape") {
        hideList();
      }
    });

    searchInput.addEventListener("input", onInputChanged);

    searchInput.addEventListener("blur", () => {
      setTimeout(() => hideList(), 180);
    });

    function escapeHtml(s) {
      return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
    }

    document.addEventListener("click", (ev) => {
      if (!wrapper.contains(ev.target)) hideList();
    });

  })();

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

  // Render Favorites list in HUD
function renderFavorites() {
  const container = document.getElementById("favoritesList");
  if (!container) return;
  container.innerHTML = "";
  const favs = getFavorites();
  if (!favs || favs.length === 0) {
    container.innerHTML = `<div style="color:var(--muted);font-size:13px;">No favorites yet</div>`;
    return;
  }
  favs.forEach((f) => {
    const el = document.createElement("div");
    el.style.display = "flex";
    el.style.justifyContent = "space-between";
    el.style.alignItems = "center";
    el.style.gap = "8px";
    el.style.padding = "8px 6px";
    el.style.borderRadius = "8px";
    el.style.background = "rgba(255,255,255,0.02)";
    el.innerHTML = `
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${escapeHtml(f.name || f.type)}
        </div>
        <div style="font-size:12px;color:var(--muted)">${escapeHtml(f.type)}</div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="chip fav-go" data-lat="${f.lat}" data-lon="${f.lon}" style="padding:6px 8px;">Go</button>
        <button class="chip fav-remove" data-id="${escapeHtml(f.id)}" style="padding:6px 8px;">Remove</button>
      </div>
    `;
    container.appendChild(el);

    el.querySelector(".fav-go")?.addEventListener("click", async () => {
      if (window.__NAV__?.setDestination) {
        await window.__NAV__.setDestination({ lat: f.lat, lng: f.lon }, `<strong>${escapeHtml(f.name || f.type)}</strong>`);
        window.__NAV__.map.setView([f.lat, f.lon], 15);
      }
    });
    el.querySelector(".fav-remove")?.addEventListener("click", () => {
      toggleFavorite({ id: f.id, type: f.type });
      renderFavorites();
    });
  });
}

// clear favorites button wiring
document.getElementById("clearFavoritesBtn")?.addEventListener("click", () => {
  saveFavorites([]);
  renderFavorites();
});

document.getElementById("addDestinationFavBtn")?.addEventListener("click", async () => {
  try {
    const dest = window.__NAV__?.destinationMarker;
    if (!dest) return showPopup("No destination set to save.", 2200);

    const latlng = dest.getLatLng();
    // try to get name if popup exists
    const name = (dest && dest.getPopup && dest.getPopup() && dest.getPopup().getContent) ? dest.getPopup().getContent() : "Saved place";
    const poi = { id: `dest:${Date.now()}`, type: "destination", lat: latlng.lat, lon: latlng.lng, name };
    const nowFav = addFavoriteFromPOI(poi);
    showPopup(nowFav ? "Saved to favorites" : "Removed from favorites", 2000);
  } catch (e) { console.warn(e); showPopup("Could not save destination", 2200); }
});


// initial render on load
renderFavorites();



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
