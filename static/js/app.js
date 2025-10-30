// app.js — full, complete
document.addEventListener("DOMContentLoaded", () => {
  // --- HUD / SIDEBAR LOGIC ---
  const hud = document.getElementById("hud");
  const btnOpen = document.getElementById("hudToggle");
  const btnClose = document.getElementById("hudClose");
  const statusText = document.getElementById("statusText");

  // allow map module to call our showPopup
  window.__APP__ = window.__APP__ || {};
  window.__APP__.showPopup = showPopup; // defined below (hoisted via function declaration)

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
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Nominatim returned ${res.status}`);
    const data = await res.json();

    if (!data || data.length === 0) {
      showPopup("No results found!");
      return;
    }

    const place = data[0];
    const lat = parseFloat(place.lat);
    const lon = parseFloat(place.lon);

    // clear previous simple markers (keeps destination/start markers if you want)
    clearMarkers();

    // Build a POI-like object compatible with your favorites helpers
    const poi = {
      id: place.osm_id ? `nominatim:${place.osm_type || 'x'}:${place.osm_id}` : `search:${Date.now()}`,
      type: place.type || "place",
      lat,
      lon,
      tags: { name: place.display_name },
      name: place.display_name,
      display_name: place.display_name
    };

    const fav = isFavorite(poi);
    const favLabel = fav ? "★ Favorited" : "☆ Favorite";
    const prettyName = place.display_name.split(",")[0] || place.display_name;

    const distText = ""; // no live-distance here (could compute if you want)
    const popupHtml = `<div style="min-width:200px">
      <strong>${escapeHtml(prettyName)}</strong><br/>
      <small style="color:#888">${escapeHtml(place.display_name)}</small>
      <div style="margin-top:8px; display:flex; gap:8px; align-items:center;">
        <button data-action="goto" data-lat="${lat}" data-lon="${lon}" class="chip">Go</button>
        <button data-action="fav" data-id="${escapeHtml(poi.id)}" class="chip">${favLabel}</button>
        <button data-action="setstart" data-lat="${lat}" data-lon="${lon}" class="chip">Set as start</button>
      </div>
    </div>`;

// Create marker in markersLayer (so it can be cleared by clearMarkers)
const marker = L.marker([lat, lon]).addTo(markersLayer);
marker.bindPopup(popupHtml);

// center map to the searched place but do not create a route automatically
map.setView([lat, lon], 15);

// wire popup interactions on open (attach listener BEFORE opening)
marker.on("popupopen", (ev) => {
  const popupEl = ev.popup.getElement();
  if (!popupEl) return;

  // GOTO -> set as destination (keeps existing setDestination behavior)
  const gotoBtn = popupEl.querySelector('button[data-action="goto"]');
  if (gotoBtn) gotoBtn.addEventListener("click", async () => {
    try {
      if (window.__NAV__ && typeof window.__NAV__.setDestination === "function") {
        await window.__NAV__.setDestination({ lat: lat, lng: lon }, `<strong>${escapeHtml(prettyName)}</strong>`);
        map.setView([lat, lon], 15);
      } else {
        marker.openPopup();
      }
    } catch (err) {
      console.warn("Failed to set destination from search marker:", err);
      marker.openPopup();
    }
  });

  // FAVORITE -> prompt name if not favorite, else remove immediately
  const favBtn = popupEl.querySelector('button[data-action="fav"]');
  if (favBtn) favBtn.addEventListener("click", async () => {
    try {
      const currentFav = isFavorite(poi);
      if (currentFav) {
        // remove
        toggleFavorite(poi);
        favBtn.textContent = "☆ Favorite";
        renderFavorites();
        showPopup("Removed from favorites", 1200);
        return;
      }

      // ask for a name before saving
      const suggested = poi.name || prettyName || "";
      const chosen = await promptFavoriteName(suggested);
      if (!chosen) {
        // cancelled by user
        return;
      }

      const toSave = {
        id: poi.id,
        type: poi.type,
        lat: poi.lat,
        lon: poi.lon,
        name: chosen,
        tags: poi.tags || {}
      };

      toggleFavorite(toSave); // toggleFavorite will add if not present
      favBtn.textContent = "★ Favorited";
      renderFavorites();
      showPopup("Saved to favorites", 1200);
    } catch (err) {
      console.warn("Favorite action failed:", err);
      showPopup("Could not update favorite", 1500);
    }
  });

  // SET AS START -> create a custom start marker and update route (if dest exists)
  const startBtn = popupEl.querySelector('button[data-action="setstart"]');
  if (startBtn) startBtn.addEventListener("click", async () => {
    try {
      if (window.__NAV__ && typeof window.__NAV__.createStartMarker === "function") {
        await window.__NAV__.createStartMarker(L.latLng(lat, lon), `<strong>Start: ${escapeHtml(prettyName)}</strong>`);
        map.setView([lat, lon], 15);
        showPopup("Start location set", 1200);
      } else {
        showPopup("Start feature unavailable", 1400);
      }
    } catch (err) {
      console.warn("Failed to set start:", err);
      showPopup("Could not set start", 1400);
    }
  });
});

// now open the popup (listener is already attached)
marker.openPopup();


    showPopup(`Found: ${prettyName}`, 1400);
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

/* ----------------------
   Favorite name modal (create-once)
   ---------------------- */
function ensureFavNameModal() {
  if (document.getElementById("favNameModal")) return document.getElementById("favNameModal");

  // create modal container
  const modal = document.createElement("div");
  modal.id = "favNameModal";
  Object.assign(modal.style, {
    position: "fixed",
    inset: "0",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 12000,
    background: "rgba(0,0,0,0.45)",
  });

  const card = document.createElement("div");
  Object.assign(card.style, {
    width: "min(420px, 92%)",
    background: "linear-gradient(180deg,#fff,#f7f9fc)",
    padding: "18px",
    borderRadius: "12px",
    boxShadow: "0 8px 30px rgba(2,6,23,0.5)",
    color: "#001",
    fontFamily: "Inter, system-ui, sans-serif"
  });

  card.innerHTML = `
    <div style="font-weight:700;margin-bottom:8px">Save to Favorites</div>
    <div style="font-size:13px;color:#334; margin-bottom:12px">Give this place a name you will recognise later.</div>
    <input id="favNameInput" type="text" placeholder="Name (required)" style="width:100%;padding:10px;border-radius:8px;border:1px solid rgba(0,0,0,0.08);font-size:14px;box-sizing:border-box" />
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button id="favNameCancel" class="chip" style="background:#eee;color:#111;padding:8px 10px;border-radius:8px">Cancel</button>
      <button id="favNameSave" class="chip" style="background:var(--accent);color:#001;padding:8px 10px;border-radius:8px">Save</button>
    </div>
    <div id="favNameErr" style="color:#c00;margin-top:8px;font-size:13px;display:none"></div>
  `;

  modal.appendChild(card);
  document.body.appendChild(modal);

  // wiring
  const input = card.querySelector("#favNameInput");
  const btnCancel = card.querySelector("#favNameCancel");
  const btnSave = card.querySelector("#favNameSave");
  const errEl = card.querySelector("#favNameErr");

  function hide() {
    modal.style.display = "none";
    input.value = "";
    errEl.style.display = "none";
  }
  function show(defaultVal = "") {
    input.value = defaultVal || "";
    errEl.style.display = "none";
    modal.style.display = "flex";
    setTimeout(() => input.focus(), 120);
  }

  btnCancel.addEventListener("click", hide);
  btnSave.addEventListener("click", () => {
    const v = (input.value || "").trim();
    if (!v) {
      errEl.textContent = "Please enter a name.";
      errEl.style.display = "";
      input.focus();
      return;
    }
    // dispatch a custom event with the name
    modal.dispatchEvent(new CustomEvent("favNameSave", { detail: { name: v } }));
    hide();
  });

  // allow Enter to save, Escape to cancel
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); btnSave.click(); }
    else if (ev.key === "Escape") { ev.preventDefault(); btnCancel.click(); }
  });

  return modal;
}

// helper to prompt for a name — returns a Promise<string|null>
function promptFavoriteName(defaultName = "") {
  return new Promise((resolve) => {
    const modal = ensureFavNameModal();
    const input = modal.querySelector("#favNameInput");
    const onSave = (ev) => {
      const name = ev.detail && ev.detail.name ? String(ev.detail.name) : null;
      modal.removeEventListener("favNameSave", onSave);
      resolve(name);
    };
    modal.addEventListener("favNameSave", onSave);
    modal.style.display = "flex";
    input.value = defaultName || "";
    input.focus();
    // if user clicks outside modal card, cancel
    const onClickOutside = (ev) => {
      if (ev.target === modal) {
        modal.style.display = "none";
        modal.removeEventListener("favNameSave", onSave);
        document.removeEventListener("click", onClickOutside);
        resolve(null);
      }
    };
    setTimeout(() => document.addEventListener("click", onClickOutside), 0);
  });
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
        <button data-action="setstart" class="chip" title="Set as start">Set start</button>
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

      const setStartBtn = popupEl.querySelector('button[data-action="setstart"]');
      if (setStartBtn) setStartBtn.addEventListener("click", async () => {
        try {
          if (window.__NAV__?.createStartMarker) {
            await window.__NAV__.createStartMarker({ lat: it.lat, lng: it.lon }, `<strong>Start: ${escapeHtml(name)}</strong>`);
            showPopup("Start set", 1400);
          } else {
            showPopup("Start feature not available", 1400);
          }
        } catch (err) {
          console.warn("Failed to set start:", err);
          showPopup("Could not set start", 1500);
        }
      });

      const favBtn = popupEl.querySelector('button[data-action="fav"]');
      if (favBtn) favBtn.addEventListener("click", async (e) => {
        try {
          // If already favorited -> remove immediately (no rename required)
          if (isFavorite(it)) {
            toggleFavorite(it);
            favBtn.textContent = "☆ Favorite";
            renderFavorites();
            showPopup("Removed from favorites", 1400);
            return;
          }

          // Prompt for a name before saving (promptFavoriteName returns null on cancel)
          const suggested = it.tags && it.tags.name ? it.tags.name : "";
          const nameInput = await promptFavoriteName(suggested);
          if (!nameInput) {
            // user cancelled
            return;
          }

          // Build POI object with chosen name and save via toggleFavorite
          const poi = {
            id: it.id ?? `poi:${it.type}:${it.lat},${it.lon}`,
            type: it.type || (it.tags && (it.tags.amenity || it.tags.shop)) || "place",
            lat: it.lat,
            lon: it.lon,
            name: nameInput,
            tags: it.tags || {}
          };

          const nowFav = toggleFavorite(poi);
          favBtn.textContent = nowFav ? "★ Favorited" : "☆ Favorite";
          renderFavorites();
          showPopup(nowFav ? "Saved to favorites" : "Updated favorite", 1400);
        } catch (err) {
          console.warn("Favorite save failed:", err);
          showPopup("Could not save favorite", 1600);
        }
      });
    });

    if (idx === 0) marker.openPopup();
  });
}
  // ==============================
  // Advanced Search + Autocomplete (robust, handles multiple #search inputs)
  // ==============================
  (function setupAdvancedSearchRobust() {
    // pick the most appropriate input:
    // prefer the navbar search (inside .center-nav) if present, otherwise use the first #search
    let searchInput = document.querySelector('.center-nav #search') || document.querySelector('#blk-search input#search') || document.querySelector('#search');
    if (!searchInput) return;

    // create a dropdown element attached to body to avoid clipping by frosted nav
    const dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-list';
    Object.assign(dropdown.style, {
      display: 'none',
      position: 'fixed',
      zIndex: '16000',
      boxSizing: 'border-box',
      maxHeight: '360px',
      overflowY: 'auto',
      minWidth: '220px'
    });
    document.body.appendChild(dropdown);

    const loadingNode = document.createElement("div");
    loadingNode.className = "autocomplete-loading";
    loadingNode.textContent = "Searching...";
    const emptyNode = document.createElement("div");
    emptyNode.className = "autocomplete-empty";
    emptyNode.textContent = "No results";

    let debounceTimer = null;
    let lastQuery = "";
    let abortController = null;
    let focusedIndex = -1;
    let currentSuggestions = [];

    function showDropdown() { dropdown.style.display = ''; }
    function hideDropdown() { dropdown.style.display = 'none'; focusedIndex = -1; updateSelection(); }

    function positionDropdown() {
      try {
        const inRect = searchInput.getBoundingClientRect();
        // place slightly below input
        dropdown.style.left = Math.round(inRect.left) + 'px';
        dropdown.style.top = Math.round(inRect.bottom + 6) + 'px';
        dropdown.style.width = Math.max(180, Math.round(inRect.width)) + 'px';
      } catch (e) {
        // ignore
      }
    }

    function updateSelection() {
      const children = Array.from(dropdown.querySelectorAll('.autocomplete-item'));
      children.forEach((c, i) => {
        c.setAttribute('aria-selected', String(i === focusedIndex));
        if (i === focusedIndex) c.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      });
    }

    function renderSuggestions(items) {
      dropdown.innerHTML = '';
      if (!items || items.length === 0) {
        dropdown.appendChild(emptyNode);
        showDropdown();
        positionDropdown();
        return;
      }
      items.forEach((it, idx) => {
        const el = document.createElement('div');
        el.className = 'autocomplete-item';
        el.setAttribute('role', 'option');
        el.setAttribute('data-idx', idx);
        el.tabIndex = -1;

        const title = document.createElement('div');
        title.className = 'autocomplete-title';
        title.innerHTML = (it.display_name || '').split(',')[0] || it.display_name || '';

        const sub = document.createElement('div');
        sub.className = 'autocomplete-sub';
        sub.textContent = it.address ? composeAddress(it.address) : (it.display_name || '');

        el.appendChild(title);
        el.appendChild(sub);

        el.addEventListener('mousedown', (ev) => {
          ev.preventDefault(); // prevent input blur before click
          chooseSuggestion(idx);
        });

        dropdown.appendChild(el);
      });
      showDropdown();
      positionDropdown();
    }

    function composeAddress(addrObj) {
      const parts = [];
      if (!addrObj) return '';
      if (addrObj.road) parts.push(addrObj.road);
      if (addrObj.suburb) parts.push(addrObj.suburb);
      if (addrObj.city) parts.push(addrObj.city);
      else if (addrObj.town) parts.push(addrObj.town);
      else if (addrObj.village) parts.push(addrObj.village);
      if (addrObj.state && parts.indexOf(addrObj.state) === -1) parts.push(addrObj.state);
      if (addrObj.country) parts.push(addrObj.country);
      return parts.join(', ');
    }

    async function fetchSuggestions(query) {
      if (!query || query.length < 2) return [];

      // cancel previous request
      if (abortController) {
        try { abortController.abort(); } catch (e) {}
      }
      abortController = new AbortController();
      const signal = abortController.signal;

      // Nominatim request (v2)
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=10&q=${encodeURIComponent(query)}&accept-language=en`;

      try {
        dropdown.innerHTML = '';
        dropdown.appendChild(loadingNode);
        showDropdown();
        positionDropdown();

        const res = await fetch(url, { signal, headers: { "Referer": window.location.origin } });
        if (!res.ok) throw new Error("Fetch failed");
        const data = await res.json();
        const rawItems = (Array.isArray(data) ? data : []).map(d => ({
          display_name: d.display_name,
          lat: parseFloat(d.lat),
          lon: parseFloat(d.lon),
          address: d.address || null,
          type: d.type || null,
          osm_id: d.osm_id,
          osm_type: d.osm_type
        }));

        // compute distances relative to live location if available
        const map = window.__NAV__?.map;
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
              distance = L.latLng(it.lat, it.lon).distanceTo(liveLatLng);
            } catch (e) { distance = null; }
          }
          return Object.assign({}, it, { distance });
        });

        // sort by distance where available
        itemsWithDistance.sort((a, b) => {
          if (a.distance == null && b.distance == null) return 0;
          if (a.distance == null) return 1;
          if (b.distance == null) return -1;
          return a.distance - b.distance;
        });

        return itemsWithDistance;
      } catch (err) {
        if (err.name === 'AbortError') return [];
        console.warn('Autocomplete fetch error:', err);
        return [];
      }
    }

    async function onInputChanged(e) {
      const q = (e.target.value || '').trim();
      lastQuery = q;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (!q || q.length < 2) {
        hideDropdown();
        return;
      }
      debounceTimer = setTimeout(async () => {
        const items = await fetchSuggestions(q);
        if (lastQuery !== q) return;
        currentSuggestions = items;
        focusedIndex = -1;
        renderSuggestions(items);
      }, 260);
    }

    async function chooseSuggestion(idx) {
      const item = currentSuggestions[idx];
      if (!item) return;
      searchInput.value = item.display_name || '';
      hideDropdown();

      const map = window.__NAV__?.map;
      const markersLayer = window.__NAV__?.markersLayer;
      const clearMarkers = window.__NAV__?.clearMarkers;

      // prefer using your existing window.__NAV__ API
      if (window.__NAV__ && typeof window.__NAV__.setDestination === 'function') {
        try {
          await window.__NAV__.setDestination({ lat: item.lat, lng: item.lon }, `<strong>${escapeHtml((item.display_name||'').split(',')[0])}</strong>`);
          if (map) map.setView([item.lat, item.lon], 15);
        } catch (err) { console.warn('setDestination failed:', err); }
        return;
      }

      // fallback: create marker as earlier behaviour
      if (!map || !markersLayer || !clearMarkers) {
        return;
      }

      clearMarkers();
      const poi = {
        id: item.osm_id ? `nominatim:${item.osm_type || 'x'}:${item.osm_id}` : `search:${Date.now()}`,
        type: item.type || 'place',
        lat: item.lat,
        lon: item.lon,
        name: item.display_name,
        tags: item.address || {}
      };

      const fav = isFavorite(poi);
      const favLabel = fav ? "★ Favorited" : "☆ Favorite";
      const prettyName = (item.display_name || '').split(',')[0] || item.display_name;

      const popupHtml = `<div style="min-width:200px">
        <strong>${escapeHtml(prettyName)}</strong><br/>
        <small style="color:#888">${escapeHtml(item.display_name)}</small>
        <div style="margin-top:8px; display:flex; gap:8px; align-items:center;">
          <button data-action="goto" data-lat="${item.lat}" data-lon="${item.lon}" class="chip">Go</button>
          <button data-action="fav" data-id="${escapeHtml(poi.id)}" class="chip">${favLabel}</button>
          <button data-action="setstart" data-lat="${item.lat}" data-lon="${item.lon}" class="chip">Set as start</button>
        </div>
      </div>`;

      const marker = L.marker([item.lat, item.lon]).addTo(markersLayer);
      marker.bindPopup(popupHtml);
      marker.on('popupopen', (ev) => {
        const popupEl = ev.popup.getElement();
        if (!popupEl) return;
        // reuse your existing handlers (similar to original code)
        const gotoBtn = popupEl.querySelector('button[data-action="goto"]');
        if (gotoBtn) gotoBtn.addEventListener('click', async () => {
          if (window.__NAV__?.setDestination) {
            await window.__NAV__.setDestination({ lat: item.lat, lng: item.lon }, `<strong>${escapeHtml(prettyName)}</strong>`);
            if (map) map.setView([item.lat, item.lon], 15);
          } else marker.openPopup();
        });
      });
      marker.openPopup();
      if (map) map.setView([item.lat, item.lon], 15);
    }

    // keyboard handling for the selected search input
    function onKeyDown(ev) {
      const key = ev.key;
      if (dropdown.style.display === 'none') {
        if (key === 'Enter') {
          ev.preventDefault();
          const q = (searchInput.value || '').trim();
          if (q.length > 0 && typeof searchPlace === 'function') searchPlace(q);
        }
        return;
      }
      if (key === 'ArrowDown') {
        ev.preventDefault();
        if (currentSuggestions.length === 0) return;
        focusedIndex = Math.min(currentSuggestions.length - 1, focusedIndex + 1);
        updateSelection();
      } else if (key === 'ArrowUp') {
        ev.preventDefault();
        if (currentSuggestions.length === 0) return;
        focusedIndex = Math.max(0, focusedIndex - 1);
        updateSelection();
      } else if (key === 'Enter') {
        if (focusedIndex >= 0 && focusedIndex < currentSuggestions.length) {
          ev.preventDefault();
          chooseSuggestion(focusedIndex);
        } else {
          ev.preventDefault();
          const q = (searchInput.value || '').trim();
          if (q.length > 0 && typeof searchPlace === 'function') searchPlace(q);
        }
      } else if (key === 'Escape') {
        hideDropdown();
      }
    }

    function escapeHtml(s) {
      return String(s || "").replace(/[&<>"']/g, (m) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
    }

    // attach listeners
    searchInput.addEventListener('input', onInputChanged);
    searchInput.addEventListener('keydown', onKeyDown);
    searchInput.addEventListener('blur', () => setTimeout(() => hideDropdown(), 180));
    document.addEventListener('click', (ev) => { if (!searchInput.contains(ev.target) && !dropdown.contains(ev.target)) hideDropdown(); });

    // reposition dropdown on resize/scroll and when the page layout changes
    window.addEventListener('resize', positionDropdown, { passive: true });
    window.addEventListener('scroll', positionDropdown, true);

    // initial position update
    setTimeout(positionDropdown, 80);
  })(); // end setupAdvancedSearchRobust IIFE



  // ==========================
  // CLEAR DESTINATION & START BUTTONS
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

  // optional clear start button (add <button id="clearStartBtn"> in HTML if you want)
  const clearStartBtn = document.getElementById("clearStartBtn");
  if (clearStartBtn) {
    clearStartBtn.addEventListener("click", () => {
      if (window.__NAV__ && typeof window.__NAV__.clearStartMarker === "function") {
        window.__NAV__.clearStartMarker();
        showPopup("Custom start cleared");
      } else {
        showPopup("Start feature not available", 1400);
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

    // --------------------------------------
  // NAVBAR: expandable search + compact pills
  // (Insert right AFTER renderFavorites();)
  // --------------------------------------
  (function setupNavbarControls() {
    const centerNav = document.querySelector('.center-nav');
    if (!centerNav) return;

    // Elements in the new nav markup (replace nav HTML first, see earlier message)
    const navSearchToggle = document.getElementById('navSearchToggle');
    const navSearchWrap = document.getElementById('navSearchWrap'); // wrapper around toggle + input
    const navSearchInput = document.querySelector('#search'); // we keep existing id so autocomplete continues to work

    const saveDestBtn = document.getElementById('saveDestBtn');
    const clearDestBtnNav = document.getElementById('clearDestBtn');
    const clearStartBtnNav = document.getElementById('clearStartBtnNav');
    const modePills = document.querySelectorAll('.mode-pill');

    // Open/close the nav search (adds .search-open to .center-nav)
    function setNavSearchOpen(open) {
      centerNav.classList.toggle('search-open', !!open);
      if (navSearchToggle) navSearchToggle.setAttribute('aria-expanded', String(!!open));
      if (open && navSearchInput) {
        // move focus after a short delay to allow CSS width animation to complete visually
        setTimeout(() => navSearchInput.focus(), 80);
      } else if (navSearchInput) {
        navSearchInput.blur();
      }
    }

    // Toggle by clicking the search icon
    navSearchToggle?.addEventListener('click', (ev) => {
      const isOpen = centerNav.classList.contains('search-open');
      setNavSearchOpen(!isOpen);
      ev.stopPropagation();
    });

    // Close on Escape
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && centerNav.classList.contains('search-open')) {
        setNavSearchOpen(false);
      }
    });

    // Click outside to close when open
    document.addEventListener('click', (ev) => {
      if (!centerNav.classList.contains('search-open')) return;
      if (!centerNav.contains(ev.target)) setNavSearchOpen(false);
    });

    // Keep panel search (if still present) in sync with navbar input
    const panelSearchInput = document.querySelector('#blk-search input#search') || (function(){
      // fallback: try to find an input in the search block that's not the nav input
      const nodes = document.querySelectorAll('#blk-search input');
      for (const n of nodes) if (n !== navSearchInput) return n;
      return null;
    })();

    if (navSearchInput && panelSearchInput) {
      navSearchInput.addEventListener('input', () => {
        if (panelSearchInput.value !== navSearchInput.value) panelSearchInput.value = navSearchInput.value;
      });
      panelSearchInput.addEventListener('input', () => {
        if (navSearchInput.value !== panelSearchInput.value) navSearchInput.value = panelSearchInput.value;
      });
    }

    // Wire Save destination pill -> reuse existing addDestinationFavBtn logic (if present)
    saveDestBtn?.addEventListener('click', async () => {
      // If your existing button handler exists (addDestinationFavBtn), call it; else dispatch custom event
      const existing = document.getElementById('addDestinationFavBtn');
      if (existing) {
        existing.click();
        return;
      }
      // fallback: dispatch a custom event app code can listen to
      document.dispatchEvent(new CustomEvent('nav:save-destination'));
      // light UI feedback
      saveDestBtn.classList.add('pressed');
      setTimeout(() => saveDestBtn.classList.remove('pressed'), 350);
    });

    // Wire Clear destination pill -> reuse existing clearDestinationBtn logic (if present)
    clearDestBtnNav?.addEventListener('click', () => {
      const existing = document.getElementById('clearDestinationBtn');
      if (existing) {
        existing.click(); // triggers the clear logic already in this file
        return;
      }
      document.dispatchEvent(new CustomEvent('nav:clear-destination'));
    });

    // Wire Clear start pill -> reuse existing clearStartBtn logic (if present)
    clearStartBtnNav?.addEventListener('click', () => {
      const existing = document.getElementById('clearStartBtn');
      if (existing) {
        existing.click();
        return;
      }
      document.dispatchEvent(new CustomEvent('nav:clear-start'));
    });

    // Mode pills: set routing mode using your window.__NAV__ API (same as .mode-btn handlers)
    modePills.forEach((p) => {
      p.addEventListener('click', () => {
        modePills.forEach(m => m.classList.remove('active'));
        p.classList.add('active');
        const mode = p.dataset.mode;
        if (window.__NAV__ && typeof window.__NAV__.setRoutingMode === 'function') {
          window.__NAV__.setRoutingMode(mode);
          showPopup(`Mode: ${mode}`, 1100);
        } else {
          // fallback: also toggle your existing .mode-btn UI if present
          const fallbackButtons = document.querySelectorAll('.mode-btn');
          fallbackButtons.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
          showPopup(`Mode changed to ${mode}`, 1100);
        }
      });
    });

    // Expose small helpers so other modules can control the nav search
    document.addEventListener('nav:open-search', () => setNavSearchOpen(true));
    document.addEventListener('nav:close-search', () => setNavSearchOpen(false));
  })();
  // --------------------------------------
  // end navbar setup
  // --------------------------------------


  // clear favorites button wiring
  document.getElementById("clearFavoritesBtn")?.addEventListener("click", () => {
    saveFavorites([]);
    renderFavorites();
  });

  // save current destination to favorites (button id: addDestinationFavBtn)
  document.getElementById("addDestinationFavBtn")?.addEventListener("click", async () => {
    try {
      const dest = window.__NAV__?.destinationMarker;
      if (!dest) return showPopup("No destination set to save.", 2200);

      const latlng = dest.getLatLng();
      // try to get name if popup exists (strip HTML if present)
      let name = "Saved place";
      try {
        const popup = dest.getPopup();
        if (popup && popup.getContent) {
          const content = popup.getContent();
          if (typeof content === "string") name = content.replace(/<\/?[^>]+(>|$)/g, "");
        }
      } catch (e) { /* ignore */ }

      // prompt for friendly name first
      const chosen = await promptFavoriteName(name);
      if (!chosen) return; // cancelled

      const poi = { id: `dest:${Date.now()}`, type: "destination", lat: latlng.lat, lon: latlng.lng, name: chosen };
      const nowFav = addFavoriteFromPOI(poi);
      showPopup(nowFav ? "Saved to favorites" : "Removed from favorites", 2000);
    } catch (e) { console.warn(e); showPopup("Could not save destination", 2200); }
  });

  // initial render on load
  renderFavorites();


  // Mode buttons wiring (driving/walking/cycling)
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

}); // end DOMContentLoaded


// Nav bar upgrade (keeps your earlier code — place at bottom or in separate file)
const hud = document.querySelector(".hud");
const hudToggle = document.getElementById("hudToggle");
const hudClose = document.getElementById("hudClose");

if (hudToggle && hud && hudClose) {
  hudToggle.addEventListener("click", () => {
    hud.classList.add("expanded");
    document.body.classList.add("hud-open");
  });

  hudClose.addEventListener("click", () => {
    hud.classList.remove("expanded");
    document.body.classList.remove("hud-open");
  });
}

