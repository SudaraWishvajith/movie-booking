import { Theater3D } from "./theater3d.js";

// ---------------- data ----------------
let MOVIES = []; // loaded from assets/movies.json
const TIMES = ["12:30", "15:45", "19:00", "21:45"];
const PRICES = [
  { rows: "ABC", label: "Front", price: 9 },
  { rows: "DEFGH", label: "Standard", price: 13 },
  { rows: "IJKL", label: "Premium", price: 16 },
];
const MAX_SEATS = 10;
const priceFor = (row) => PRICES.find((p) => p.rows.includes(row));

const state = {
  movie: null,
  date: null,
  time: TIMES[2],
  selected: new Set(), // node names
  taken: new Set(),
  focus: null,
};

// ---------------- helpers ----------------
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const $ = (s) => document.querySelector(s);
const fmtMoney = (n) => `$${n.toFixed(2)}`;
const showKey = () => `${state.movie.id}|${state.date}|${state.time}`;
const fmtRelease = (iso) => new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
const thumbUrl = (id, q = "maxresdefault") => `https://i.ytimg.com/vi/${id}/${q}.jpg`;

function loadBookings() { try { return JSON.parse(localStorage.getItem("starlight.bookings") || "{}"); } catch { return {}; } }
function saveBookings(b) { try { localStorage.setItem("starlight.bookings", JSON.stringify(b)); } catch { /* storage unavailable */ } }

// Shown on the 3D screen while the trailer loads (or if it can't play).
function screenCard(m) {
  const w = 2048, h = 858;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  const [c0, c1, c2] = m.palette || ["#050505", "#222", "#888"];
  const g = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, w * 0.6);
  g.addColorStop(0, c1); g.addColorStop(1, c0);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = c2; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  let size = 150;
  ctx.font = `${size}px "Bebas Neue", Impact, sans-serif`;
  while (ctx.measureText(m.title.toUpperCase()).width > w * 0.85 && size > 60) { size -= 6; ctx.font = `${size}px "Bebas Neue", Impact, sans-serif`; }
  ctx.fillText(m.title.toUpperCase(), w / 2, h * 0.45);
  ctx.globalAlpha = 0.7; ctx.font = `40px Inter, sans-serif`;
  ctx.fillText("Trailer loading…", w / 2, h * 0.45 + size * 0.8);
  return c;
}

// ---------------- 3D viewer ----------------
let seatList = [];
const seatByNode = new Map();
const seatEls = new Map(); // node -> [side-panel seat, overlay seat]

const theater = new Theater3D($("#scene"), {
  onSeatClick: (node) => handleSeatClick(node),
  onSeatHover: (node) => {
    seatEls.forEach((els) => els.forEach((el) => el.classList.remove("hover3d")));
    if (node && seatEls.get(node)) seatEls.get(node).forEach((el) => el.classList.add("hover3d"));
  },
});

// ---------------- UI: movies / dates / times ----------------
function buildMovies() {
  const grid = $("#movieGrid"); grid.innerHTML = "";
  const chips = $("#movieChips"); chips.innerHTML = "";
  for (const m of MOVIES) {
    const card = document.createElement("article");
    card.className = "movie"; card.dataset.id = m.id;
    card.innerHTML = `
      <button class="thumb" aria-label="Play the ${escapeHtml(m.title)} trailer on the cinema screen">
        <img src="${thumbUrl(m.youtubeId)}" alt="" loading="lazy" />
        <span class="play">▶</span>
      </button>
      <div class="movie-info">
        <h3>${escapeHtml(m.title)}</h3>
        <div class="movie-meta">${escapeHtml(m.genre)}</div>
        <div class="movie-meta">In theaters ${fmtRelease(m.release)}</div>
        <button class="btn btn-sm">Book tickets</button>
      </div>`;
    // maxres thumbnails don't exist for every video: fall back to the 16:9 medium one
    card.querySelector("img").addEventListener("error", (e) => {
      if (!e.target.dataset.fb) { e.target.dataset.fb = 1; e.target.src = thumbUrl(m.youtubeId, "mqdefault"); }
    });
    const go = () => { selectMovie(m); $("#booking").scrollIntoView({ behavior: "smooth" }); };
    card.querySelector(".thumb").addEventListener("click", go);
    card.querySelector(".btn").addEventListener("click", go);
    grid.appendChild(card);

    const chip = document.createElement("button");
    chip.className = "chip"; chip.dataset.id = m.id; chip.textContent = m.title;
    chip.addEventListener("click", () => selectMovie(m));
    chips.appendChild(chip);
  }
}

function buildDates() {
  const wrap = $("#dateChips"); wrap.innerHTML = "";
  const today = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    if (i === 0) state.date = iso;
    const chip = document.createElement("button");
    chip.className = "chip"; chip.dataset.date = iso;
    chip.innerHTML = `${i === 0 ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" })}<small>${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small>`;
    chip.addEventListener("click", () => { state.date = iso; refreshShow(); });
    wrap.appendChild(chip);
  }
}

function buildTimes() {
  const wrap = $("#timeChips"); wrap.innerHTML = "";
  for (const t of TIMES) {
    const chip = document.createElement("button");
    chip.className = "chip"; chip.dataset.time = t; chip.textContent = t;
    chip.addEventListener("click", () => { state.time = t; refreshShow(); });
    wrap.appendChild(chip);
  }
}

function selectMovie(m) {
  const changed = state.movie !== m;
  state.movie = m;
  if (changed || !theater.videoId) {
    theater.setScreenImage(screenCard(m));
    theater.setScreenVideo(m.youtubeId, m.palette && m.palette[1]);
    $("#trailerCredit").textContent = `Now playing: ${m.title} trailer · via ${m.trailerSource}`;
  }
  refreshShow();
}

function markActive() {
  if (!state.movie) return;
  document.querySelectorAll("#movieChips .chip, .movie").forEach((el) => el.classList.toggle("active", el.dataset.id === state.movie.id));
  document.querySelectorAll("#dateChips .chip").forEach((el) => el.classList.toggle("active", el.dataset.date === state.date));
  document.querySelectorAll("#timeChips .chip").forEach((el) => el.classList.toggle("active", el.dataset.time === state.time));
  const d = new Date(state.date + "T00:00:00");
  $("#bookingMovieLabel").textContent = `${state.movie.title} · ${d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · ${state.time} · Hall 1`;
}

// a showtime changed: recompute taken seats, clear the selection
function refreshShow() {
  markActive();
  if (!seatList.length || !state.movie) return;
  const rnd = mulberry32(hash(showKey()));
  const evening = state.time >= "19:00" ? 0.1 : 0;
  state.taken = new Set();
  for (const s of seatList) {
    const centerness = 1 - Math.min(1, Math.abs(s.position[0]) / 8);
    const rowPref = 1 - Math.abs("ABCDEFGHIJKL".indexOf(s.row) - 7) / 8;
    if (rnd() < 0.04 + evening + 0.26 * centerness * rowPref) state.taken.add(s.node);
  }
  const booked = loadBookings()[showKey()] || [];
  booked.forEach((n) => state.taken.add(n));
  state.selected.clear();
  renderSeats();
  updateSummary();
}

// ---------------- seat map ----------------
function buildSeatMap(map) {
  map.innerHTML = "";
  const rows = [...new Set(seatList.map((s) => s.row))];
  for (const r of rows) {
    const rowEl = document.createElement("div"); rowEl.className = "seat-row";
    rowEl.insertAdjacentHTML("beforeend", `<span class="row-label">${r}</span>`);
    const seats = seatList.filter((s) => s.row === r).sort((a, b) => a.number - b.number);
    seats.forEach((s, i) => {
      if (i === 5 || i === 17) rowEl.insertAdjacentHTML("beforeend", `<span class="aisle"></span>`);
      const b = document.createElement("button");
      b.className = "seat"; b.title = `Row ${s.row}, Seat ${s.number} · ${priceFor(s.row).label} ${fmtMoney(priceFor(s.row).price)}`;
      b.setAttribute("aria-label", b.title);
      b.addEventListener("click", () => handleSeatClick(s.node));
      b.addEventListener("mouseenter", () => theater.setHover(s.node));
      b.addEventListener("mouseleave", () => theater.setHover(null));
      if (!seatEls.has(s.node)) seatEls.set(s.node, []);
      seatEls.get(s.node).push(b);
      rowEl.appendChild(b);
    });
    rowEl.insertAdjacentHTML("beforeend", `<span class="row-label">${r}</span>`);
    map.appendChild(rowEl);
  }
}

function seatStatus(node) {
  if (state.taken.has(node)) return "taken";
  if (state.selected.has(node)) return "selected";
  return priceFor(seatByNode.get(node).row).label === "Premium" ? "premium" : "free";
}

function renderSeats() {
  for (const s of seatList) {
    const st = seatStatus(s.node);
    const cls = "seat" + (st === "premium" ? " premium" : "") + (st === "selected" ? " selected" : "") + (st === "taken" ? " taken" : "") + (state.focus === s.node ? " focus" : "");
    for (const el of seatEls.get(s.node)) el.className = cls;
    theater.setSeatState(s.node, st);
  }
}

function handleSeatClick(node) {
  const taken = state.taken.has(node);
  if (!taken) {
    if (state.selected.has(node)) {
      if (state.focus === node) state.selected.delete(node);
    } else if (state.selected.size < MAX_SEATS) {
      state.selected.add(node);
    }
  }
  // always fly into the seat to preview its view (even taken ones)
  state.focus = node;
  updateOverlay();
  theater.flyToSeat(node);
  showSeatInfo(node, taken);
  renderSeats();
  updateSummary();
}

function showSeatInfo(node, taken) {
  const s = seatByNode.get(node);
  const tier = priceFor(s.row);
  $("#hudSeat").textContent = `Row ${s.row} · Seat ${s.number}`;
  const how = gyroOn ? "move your phone to look around" : "drag to look around";
  $("#hudHint").textContent = taken ? `Already taken — preview only · ${how}` : `${tier.label} · ${fmtMoney(tier.price)} · ${how}`;
  $("#btnRecenter").hidden = !gyroOn;
  if (Theater3D.gyroSupported() && !gyroOn && !gyroHintShown) {
    gyroHintShown = true;
    toast("Tip: tap 📱 Gyro and move your phone to look around");
  }
  const st = theater.seatStats(node);
  if (!st) return;
  $("#viewStats").hidden = false;
  $("#statDist").textContent = `${st.distance.toFixed(1)} m`;
  $("#statAngle").textContent = `${Math.round(st.horizAngle)}° of view`;
  $("#statOff").textContent = st.offCenter < 3 ? "Centered" : `${Math.round(st.offCenter)}°`;
  let rating = "Ideal";
  if (st.lookUp > 32) rating = "Very close · look up";
  else if (st.horizAngle > 62) rating = "Immersive";
  else if (st.horizAngle < 40) rating = "Relaxed";
  if (st.offCenter > 25) rating += " · side angle";
  $("#statRating").textContent = rating;
}

// ---------------- trailer sound ----------------
$("#btnSound").addEventListener("click", () => {
  const muted = !theater.videoMuted;
  theater.setVideoMuted(muted);
  $("#btnSound").setAttribute("aria-pressed", String(!muted));
  $("#btnSound").textContent = muted ? "🔇 Sound" : "🔊 Sound";
});
// pause the trailer when the booking section is off screen
new IntersectionObserver(([e]) => theater.setVideoPlaying(e.isIntersecting), { threshold: 0.15 }).observe($("#viewer"));

// ---------------- gyro look-around (phones) ----------------
let gyroOn = false;
let gyroHintShown = false;
let toastTimer = null;
function toast(msg, ms = 3200) {
  const el = $("#viewerToast");
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}
function setGyroUi(on) {
  gyroOn = on;
  $("#btnGyro").setAttribute("aria-pressed", String(on));
  $("#btnRecenter").hidden = !(on && state.focus);
  if (state.focus) showSeatInfo(state.focus, state.taken.has(state.focus));
}
if (Theater3D.gyroSupported()) $("#btnGyro").hidden = false;

$("#btnGyro").addEventListener("click", async () => {
  if (gyroOn) {
    theater.disableGyro();
    setGyroUi(false);
    toast("Gyro off · drag to look around");
    return;
  }
  const ok = await theater.enableGyro(); // needs the tap for iOS permission
  if (!ok) {
    toast(window.isSecureContext ? "Motion sensors aren't available on this device" : "Gyro needs the site on HTTPS");
    return;
  }
  setGyroUi(true);
  toast(state.focus ? "Gyro on · move your phone to look around" : "Gyro on · pick a seat to try it");
});

$("#btnRecenter").addEventListener("click", () => {
  if (!state.focus) return;
  theater.flyToSeat(state.focus); // re-aims at the screen and resets the phone's reference
  toast("Re-centered on the screen");
});

function goOverview() {
  state.focus = null;
  $("#btnRecenter").hidden = true;
  theater.flyToOverview();
  $("#hudSeat").textContent = "Overview";
  $("#hudHint").textContent = "Drag to look around · click a seat to see its view";
  $("#viewStats").hidden = true;
  renderSeats();
  updateOverlay();
}
$("#btnOverview").addEventListener("click", goOverview);

// ---------------- seat-map overlay on the 3D overview ----------------
let layoutOn = true;
let hallReady = false;
function updateOverlay() {
  const show = hallReady && layoutOn && !state.focus;
  $("#seatOverlay").hidden = !show;
  $("#viewer").classList.toggle("overlay-open", show);
  $("#btnLayout").setAttribute("aria-pressed", String(layoutOn));
  $("#btnOverview").hidden = !state.focus; // only useful from a seat view
}
$("#btnLayout").addEventListener("click", () => {
  if (state.focus) {
    // from a seat view, the button always means "back to the map"
    layoutOn = true;
    goOverview();
    return;
  }
  layoutOn = !layoutOn;
  updateOverlay();
});

// ---------------- summary & checkout ----------------
function selectedSorted() {
  return [...state.selected].map((n) => seatByNode.get(n)).sort((a, b) => a.row.localeCompare(b.row) || a.number - b.number);
}
function updateSummary() {
  const list = selectedSorted();
  const total = list.reduce((t, s) => t + priceFor(s.row).price, 0);
  $("#sumSeats").textContent = list.length ? list.map((s) => `${s.row}${s.number}`).join(", ") : "None selected";
  $("#sumCount").textContent = list.length;
  $("#sumTotal").textContent = fmtMoney(total);
  $("#btnCheckout").disabled = !list.length;
  return { list, total };
}

$("#btnCheckout").addEventListener("click", () => {
  const { list, total } = updateSummary();
  const d = new Date(state.date + "T00:00:00");
  $("#modalSummary").innerHTML = `
    <div><strong>${escapeHtml(state.movie.title)}</strong></div>
    <div>${d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · ${state.time} · Hall 1</div>
    <div>Seats: <strong>${list.map((s) => `${s.row}${s.number}`).join(", ")}</strong></div>
    <div>Total: <strong>${fmtMoney(total)}</strong></div>`;
  $("#checkoutModal").showModal();
});

$("#checkoutModal").addEventListener("close", () => {
  if ($("#checkoutModal").returnValue !== "confirm") return;
  const { list } = updateSummary();
  const bookings = loadBookings();
  const key = showKey();
  bookings[key] = [...new Set([...(bookings[key] || []), ...list.map((s) => s.node)])];
  saveBookings(bookings);
  const code = "SL-" + (hash(key + list.map((s) => s.node).join() + Date.now()) % 1e6).toString().padStart(6, "0");
  const name = new FormData($("#checkoutForm")).get("name");
  $("#ticketBody").innerHTML = `
    <h3>You're booked!</h3>
    <div class="code">${code}</div>
    <p>${escapeHtml(name || "")}, enjoy <strong>${escapeHtml(state.movie.title)}</strong> at ${state.time}.<br/>Seats ${list.map((s) => `${s.row}${s.number}`).join(", ")}.</p>
    <form method="dialog"><button class="btn">Done</button></form>`;
  $("#ticketModal").showModal();
  $("#checkoutForm").reset();
  list.forEach((s) => state.taken.add(s.node));
  state.selected.clear();
  renderSeats();
  updateSummary();
});

// keep --nav-h in sync with the sticky header so the phone 3D view fits exactly below it
const setNavH = () => document.documentElement.style.setProperty("--nav-h", `${$(".nav").offsetHeight}px`);
setNavH();
window.addEventListener("resize", setNavH);

// ---------------- init ----------------
buildDates();
buildTimes();

fetch("assets/movies.json")
  .then((r) => r.json())
  .then((data) => {
    MOVIES = data.movies;
    state.movie = MOVIES[0];
    buildMovies();
    markActive();
    return theater.load("assets/cinema_theater.glb", "assets/seats.json", (p) => {
      $("#loadingText").textContent = `Loading the hall… ${Math.round(p * 100)}%`;
    });
  })
  .then((info) => {
    seatList = info.seats;
    seatList.forEach((s) => seatByNode.set(s.node, s));
    buildSeatMap($("#seatMap"));
    buildSeatMap($("#overlayMap"));
    selectMovie(state.movie);
    $("#viewerLoading").classList.add("hidden");
    hallReady = true;
    updateOverlay();
  })
  .catch((err) => {
    console.error(err);
    $("#loadingText").textContent = "Couldn't load the 3D hall. Serve this folder over http (not file://).";
  });
