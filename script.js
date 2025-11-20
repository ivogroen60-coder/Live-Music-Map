// ----------------- CONFIG -----------------
// Paste or set your API key here (you provided one earlier).
// You can also set it in the HTML Google Maps script tag instead.
// NOTE: It's visible client-side on GitHub Pages. Restrict it in Google Console.
const GOOGLE_API_KEY = "AIzaSyBaNL6CmJdxhlk_FHtzcHj78oNAvjAjw3Q";

// CSV path relative to repo root (served by GitHub Pages)
const CSV_URL = "data/venues.csv";

// Map options
const DEFAULT_CENTER = { lat: 51.5074, lng: -0.1278 }; // London example
const DEFAULT_ZOOM = 13;
// ------------------------------------------

let map, placesService;
let markers = [];
let venues = []; // array of objects loaded from CSV

// Helper: load Google Maps script programmatically with Places library
function loadGoogleMaps() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) return resolve();
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}&libraries=places&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });
}

// Initialize map
async function initMap() {
  await loadGoogleMaps();
  map = new google.maps.Map(document.getElementById("map"), {
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
  });
  placesService = new google.maps.places.PlacesService(map);
}

// Parse CSV from URL (uses PapaParse)
function loadCsvFromUrl(url) {
  return fetch(url).then(r => {
    if (!r.ok) throw new Error("CSV not found. Upload data/venues.csv to your repo.");
    return r.text();
  }).then(text => {
    return new Promise((resolve) => {
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      resolve(parsed.data);
    });
  });
}

// Convert CSV rows to venue objects with guaranteed fields
function normalizeRows(rows) {
  return rows.map((r, idx) => {
    const lat = parseFloat(r.latitude || r.lat || r.latlng?.split(",")[0]);
    const lng = parseFloat(r.longitude || r.lng || r.latlng?.split(",")[1]);
    return {
      id: idx,
      latitude: lat,
      longitude: lng,
      name: (r.name || "").trim(),
      email: (r.email || "").trim(),
      genre: (r.genre || "").trim(),
      raw: r
    };
  }).filter(v => !Number.isNaN(v.latitude) && !Number.isNaN(v.longitude));
}

// Create marker and popup for a venue
function createMarker(venue) {
  const pos = { lat: venue.latitude, lng: venue.longitude };
  const marker = new google.maps.Marker({
    position: pos,
    map,
    title: venue.name
  });

  const infoDiv = document.createElement("div");
  infoDiv.className = "infoContent";
  infoDiv.innerHTML = `<h3>${escapeHtml(venue.name)}</h3>
                       <p><a href="mailto:${escapeHtml(venue.email)}">${escapeHtml(venue.email)}</a></p>
                       <div class="photos" id="photos-${venue.id}">Loading photos…</div>
                       <p><button data-id="${venue.id}" class="edit-genre">Edit Genre</button></p>`;

  const infoWindow = new google.maps.InfoWindow({
    content: infoDiv
  });

  marker.addListener("click", () => {
    infoWindow.open(map, marker);
  });

  // fetch photos via Places nearbySearch or findPlaceFromQuery
  fetchPlacePhotos(venue, infoDiv);

  markers.push({ marker, venue, infoWindow });
  return marker;
}

// Escape HTML for safety
function escapeHtml(text) {
  return (text || "").toString()
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Try to find a nearby place matching the name and get photos
function fetchPlacePhotos(venue, containerEl) {
  if (!placesService) {
    containerEl.querySelector(`#photos-${venue.id}`).innerText = "Places service not available.";
    return;
  }

  const location = new google.maps.LatLng(venue.latitude, venue.longitude);

  // nearbySearch with small radius & keyword=name
  const req = {
    location,
    radius: 80, // tight radius
    keyword: venue.name,
    rankBy: undefined,
  };

  // fallback placeholder
  const photosDiv = containerEl.querySelector(`#photos-${venue.id}`);

  placesService.nearbySearch(req, (results, status) => {
    if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length) {
      // pick best match (first)
      const place = results[0];
      // request details to ensure photos array available
      placesService.getDetails({ placeId: place.place_id, fields: ["photos","name","formatted_address","rating"] }, (d, s2) => {
        if (s2 === google.maps.places.PlacesServiceStatus.OK && d.photos && d.photos.length) {
          renderPhotosFromPlace(d.photos, photosDiv, venue.id);
        } else if (place.photos && place.photos.length) {
          renderPhotosFromPlace(place.photos, photosDiv, venue.id);
        } else {
          photosDiv.innerText = "No photos found.";
        }
      });
    } else {
      // Try findPlaceFromQuery as a backup
      const query = `${venue.name} ${venue.latitude}, ${venue.longitude}`;
      placesService.findPlaceFromQuery({ query, fields: ["photos","place_id","name"] }, (res2, st2) => {
        if (st2 === google.maps.places.PlacesServiceStatus.OK && res2 && res2.length && res2[0].photos) {
          renderPhotosFromPlace(res2[0].photos, photosDiv, venue.id);
        } else {
          photosDiv.innerText = "No photos found.";
        }
      });
    }
  });
}

// Render up to 3 photos into the DOM
function renderPhotosFromPlace(photosArray, container, vid) {
  container.innerHTML = "";
  const max = Math.min(3, photosArray.length);
  for (let i = 0; i < max; i++) {
    const p = photosArray[i];
    const url = p.getUrl({ maxWidth: 400 });
    const img = document.createElement("img");
    img.src = url;
    img.alt = `Photo ${i+1}`;
    img.style.width = "100%";
    img.style.maxHeight = "150px";
    img.style.objectFit = "cover";
    img.style.display = "block";
    img.style.marginBottom = "6px";
    container.appendChild(img);
  }
}

// Build the sidebar list
function buildList(venuesToShow) {
  const ul = document.getElementById("venueList");
  ul.innerHTML = "";
  venuesToShow.forEach(v => {
    const li = document.createElement("li");
    li.className = "venueItem";
    li.innerHTML = `<div class="meta">
                      <strong>${escapeHtml(v.name)}</strong><br/>
                      <small>${escapeHtml(v.email)}</small><br/>
                      <small><em>${escapeHtml(v.genre || "")}</em></small>
                    </div>
                    <div class="actions">
                      <button data-id="${v.id}" class="zoomBtn">Zoom</button>
                      <button data-id="${v.id}" class="editBtn">Edit</button>
                    </div>`;
    ul.appendChild(li);

    // events
    li.querySelector(".zoomBtn").addEventListener("click", () => {
      map.setCenter({ lat: v.latitude, lng: v.longitude });
      map.setZoom(16);
      // open marker infowindow
      const m = markers.find(mk => mk.venue.id === v.id);
      if (m) m.infoWindow.open(map, m.marker);
    });

    li.querySelector(".editBtn").addEventListener("click", () => openEditModal(v));
  });
}

// Build genre select options from current venues
function buildGenreFilter() {
  const sel = document.getElementById("genreFilter");
  const genres = Array.from(new Set(venues.map(v => (v.genre || "").trim()).filter(Boolean))).sort();
  // reset
  sel.innerHTML = '<option value="all">All</option>';
  for (const g of genres) {
    const opt = document.createElement("option");
    opt.value = g;
    opt.textContent = g;
    sel.appendChild(opt);
  }
}

// Filter markers by genre
function applyFilter() {
  const sel = document.getElementById("genreFilter");
  const val = sel.value;
  const visibleIds = new Set(venues.filter(v => (val === "all" || (v.genre || "") === val)).map(v => v.id));

  // markers visibility
  markers.forEach(m => {
    if (visibleIds.has(m.venue.id)) {
      m.marker.setMap(map);
    } else {
      m.marker.setMap(null);
      m.infoWindow.close();
    }
  });

  // update list
  buildList(venues.filter(v => visibleIds.has(v.id)));
}

// Modal for editing genre
let modalEl, modalVenue, genreInput;
function setupModal() {
  modalEl = document.getElementById("editModal");
  genreInput = document.getElementById("genreInput");

  document.getElementById("cancelGenreBtn").addEventListener("click", closeEditModal);
  document.getElementById("saveGenreBtn").addEventListener("click", () => {
    const newGenre = genreInput.value.trim();
    if (modalVenue) {
      modalVenue.genre = newGenre;
      // update raw as well to enable CSV download
      modalVenue.raw.genre = newGenre;
      buildGenreFilter();
      applyFilter();
    }
    closeEditModal();
  });
}

function openEditModal(venue) {
  modalVenue = venue;
  document.getElementById("editVenueName").textContent = venue.name;
  genreInput.value = venue.genre || "";
  modalEl.classList.remove("hidden");
}

function closeEditModal() {
  modalVenue = null;
  modalEl.classList.add("hidden");
}

// CSV download of current data
function downloadCsv() {
  // reconstruct header from raw keys plus added genre field
  const headers = ["latitude","longitude","name","email"];
  // keep any extra columns the user had
  const extraKeys = Object.keys(venues[0]?.raw || {}).filter(k => !headers.includes(k) && k !== "genre");
  const finalHeaders = headers.concat(extraKeys).concat(["genre"]);

  const rows = [finalHeaders.join(",")];
  for (const v of venues) {
    const raw = v.raw || {};
    const row = finalHeaders.map(h => {
      let val = raw[h];
      if (h === "latitude") val = v.latitude;
      if (h === "longitude") val = v.longitude;
      if (h === "name") val = v.name;
      if (h === "email") val = v.email;
      if (h === "genre") val = v.genre || "";
      return `"${String(val || "").replace(/"/g,'""')}"`;
    }).join(",");
    rows.push(row);
  }

  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "venues-updated.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// Load CSV from either uploaded file (local) or from repo URL
async function loadAndRenderFromFileOrUrl(file) {
  let rows;
  if (file) {
    // file from input
    rows = await new Promise((res) => {
      Papa.parse(file, { header: true, skipEmptyLines: true, complete: (p) => res(p.data) });
    });
  } else {
    rows = await loadCsvFromUrl(CSV_URL);
  }
  venues = normalizeRows(rows);

  // clear existing markers
  markers.forEach(m => {
    m.marker.setMap(null);
    m.infoWindow.close();
  });
  markers = [];

  // create markers
  venues.forEach(v => createMarker(v));

  buildGenreFilter();
  applyFilter();
  buildList(venues);
}

// Escape CSV upload input and wire up controls
function setupControls() {
  document.getElementById("downloadCsvBtn").addEventListener("click", downloadCsv);
  const csvInput = document.getElementById("csvFileInput");
  csvInput.addEventListener("change", (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    loadAndRenderFromFileOrUrl(f).catch(err => alert("Error loading CSV: " + err.message));
  });

  document.getElementById("genreFilter").addEventListener("change", applyFilter);

  // delegate edit-genre buttons within popups (they are added dynamically)
  document.addEventListener("click", (ev) => {
    if (ev.target && ev.target.matches && ev.target.matches(".edit-genre")) {
      const id = Number(ev.target.getAttribute("data-id"));
      const v = venues.find(x => x.id === id);
      if (v) openEditModal(v);
    }
  });
}

async function boot() {
  try {
    await initMap();
    setupModal();
    setupControls();
    await loadAndRenderFromFileOrUrl(); // load from repo CSV by default
  } catch (err) {
    console.error(err);
    alert("Error initializing map: " + err.message);
  }
}

boot();
