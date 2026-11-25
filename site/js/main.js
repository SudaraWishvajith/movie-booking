import { Theater3D } from "./theater3d.js";

// ---------------- data ----------------
const MOVIES = [
  { id: "dawn", title: "Echoes of Dawn", genre: "Drama · Adventure", runtime: "2h 18m", rating: "PG-13",
    palette: ["#1b2a5e", "#f08a5d", "#ffd9a0"], motif: "mountains" },
  { id: "neon", title: "Neon Harbor", genre: "Sci-fi · Thriller", runtime: "2h 04m", rating: "R",
    palette: ["#0a0620", "#ff2e88", "#27e1ff"], motif: "city" },
  { id: "orbit", title: "The Last Orbit", genre: "Sci-fi · Drama", runtime: "2h 31m", rating: "PG-13",
    palette: ["#02030a", "#3b5bdb", "#ffd166"], motif: "planet" },
  { id: "paper", title: "Paper Kingdoms", genre: "Animation · Family", runtime: "1h 42m", rating: "PG",
    palette: ["#0f3b3a", "#7ed6a5", "#fff3c4"], motif: "castle" },
  { id: "tide", title: "Under the Red Tide", genre: "Mystery · Horror", runtime: "1h 56m", rating: "R",
    palette: ["#12030a", "#a4161a", "#f5cac3"], motif: "moon" },
];
const TIMES = ["12:30", "15:45", "19:00", "21:45"];
const PRICES = [
  { rows: "ABC", label: "Front", price: 9 },
  { rows: "DEFGH", label: "Standard", price: 13 },
  { rows: "IJKL", label: "Premium", price: 16 },
];
const MAX_SEATS = 10;
const priceFor = (row) => PRICES.find((p) => p.rows.includes(row));

const state = {
  movie: MOVIES[0],
  date: null,
  time: TIMES[2],
  selected: new Set(), // node names
  taken: new Set(),
  focus: null,
};

// ---------------- artwork (posters & on-screen stills) ----------------
function paintScene(ctx, w, h, m, { poster = false } = {}) {
  const [c0, c1, c2] = m.palette;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, c0); g.addColorStop(0.62, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const rnd = mulberry32(hash(m.id));
  const S = Math.min(w, h);

  if (m.motif === "mountains" || m.motif === "moon") {
    const sun = ctx.createRadialGradient(w * 0.62, h * 0.55, 0, w * 0.62, h * 0.55, S * 0.5);
    sun.addColorStop(0, m.motif === "moon" ? "rgba(255,230,230,.95)" : "rgba(255,240,200,1)");
    sun.addColorStop(0.12, m.motif === "moon" ? "rgba(255,120,120,.5)" : "rgba(255,200,130,.6)");
    sun.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sun; ctx.fillRect(0, 0, w, h);
    const layers = m.motif === "moon" ? ["#3b0a12", "#22050b", "#0c0205"] : ["#7a3b4f", "#4a2030", "#1a0b14"];
    layers.forEach((col, i) => {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, h);
      const base = h * (0.62 + i * 0.1), amp = h * (0.08 - i * 0.015);
      for (let x = 0; x <= w; x += w / 80) {
        const y = base - amp * (0.5 * Math.sin(x / w * 9 + i * 2) + 0.3 * Math.sin(x / w * 23 + i) + 0.2 * Math.sin(x / w * 51));
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h); ctx.fill();
    });
  } else if (m.motif === "city") {
    for (let i = 0; i < 260; i++) { ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.5})`; ctx.fillRect(rnd() * w, rnd() * h * 0.5, 1.5, 1.5); }
    let x = 0;
    while (x < w) {
      const bw = S * (0.04 + rnd() * 0.08), bh = h * (0.2 + rnd() * 0.45);
      ctx.fillStyle = "#07040f"; ctx.fillRect(x, h * 0.78 - bh, bw, bh);
      for (let k = 0; k < bh / 9; k++) {
        if (rnd() > 0.55) { ctx.fillStyle = rnd() > 0.5 ? m.palette[1] : m.palette[2]; ctx.globalAlpha = 0.7; ctx.fillRect(x + 3 + rnd() * (bw - 8), h * 0.78 - bh + k * 9 + 3, 3, 3); ctx.globalAlpha = 1; }
      }
      x += bw + 2;
    }
    const water = ctx.createLinearGradient(0, h * 0.78, 0, h);
    water.addColorStop(0, "rgba(255,46,136,.45)"); water.addColorStop(1, "#05020c");
    ctx.fillStyle = water; ctx.fillRect(0, h * 0.78, w, h * 0.22);
  } else if (m.motif === "planet") {
    for (let i = 0; i < 400; i++) { ctx.fillStyle = `rgba(255,255,255,${rnd()})`; ctx.fillRect(rnd() * w, rnd() * h, rnd() * 2, rnd() * 2); }
    const r = S * 0.42, cx = w * 0.35, cy = h * 0.95;
    const pg = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.5, r * 0.1, cx, cy, r);
    pg.addColorStop(0, "#9bb4ff"); pg.addColorStop(0.6, "#3b5bdb"); pg.addColorStop(1, "#060a24");
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,209,102,.7)"; ctx.lineWidth = S * 0.01;
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.6, r * 0.25, -0.2, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    ctx.fillStyle = "#ffd166"; ctx.beginPath(); ctx.arc(w * 0.78, h * 0.25, S * 0.012, 0, Math.PI * 2); ctx.fill();
  } else if (m.motif === "castle") {
    const hill = (base, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, h); for (let x = 0; x <= w; x += w / 60) ctx.lineTo(x, base - Math.sin(x / w * 5) * h * 0.04); ctx.lineTo(w, h); ctx.fill(); };
    hill(h * 0.7, "#2c6e5a");
    ctx.fillStyle = "#123b32";
    const cx = w * 0.55, base = h * 0.68, u = S * 0.05;
    [[-3, 4], [-1.5, 6], [0, 8], [1.5, 6], [3, 4]].forEach(([dx, hh]) => {
      ctx.fillRect(cx + dx * u - u * 0.6, base - hh * u, u * 1.2, hh * u);
      ctx.beginPath(); ctx.moveTo(cx + dx * u - u * 0.8, base - hh * u); ctx.lineTo(cx + dx * u, base - hh * u - u * 1.6); ctx.lineTo(cx + dx * u + u * 0.8, base - hh * u); ctx.fill();
    });
    hill(h * 0.82, "#0d2a24");
    for (let i = 0; i < 40; i++) { ctx.fillStyle = "rgba(255,243,196,.8)"; ctx.beginPath(); ctx.arc(rnd() * w, rnd() * h * 0.5, rnd() * 2 + 0.5, 0, 7); ctx.fill(); }
  }
  if (m.motif === "moon") { ctx.fillStyle = "rgba(160,10,20,.18)"; ctx.fillRect(0, 0, w, h); }

  if (poster) {
    const v = ctx.createLinearGradient(0, h * 0.55, 0, h);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.85)");
    ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff"; ctx.textAlign = "center";
    ctx.font = `${Math.round(w * 0.13)}px "Bebas Neue", Impact, sans-serif`;
    wrapText(ctx, m.title.toUpperCase(), w / 2, h * 0.86, w * 0.86, w * 0.13);
  }
}
function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(" "); const lines = []; let line = "";
  for (const w of words) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, x, y - (lines.length - 1 - i) * lh));
}
function makeCanvas(w, h, m, opts) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  paintScene(c.getContext("2d"), w, h, m, opts); return c;
}

// ---------------- helpers ----------------
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const $ = (s) => document.querySelector(s);
const fmtMoney = (n) => `$${n.toFixed(2)}`;
const showKey = () => `${state.movie.id}|${state.date}|${state.time}`;
const label = (node) => { const s = seatByNode.get(node); return s ? `${s.row}${s.number}` : node; };

function loadBookings() { try { return JSON.parse(localStorage.getItem("starlight.bookings") || "{}"); } catch { return {}; } }
function saveBookings(b) { try { localStorage.setItem("starlight.bookings", JSON.stringify(b)); } catch { /* storage unavailable */ } }

// ---------------- 3D viewer ----------------
let seatList = [];
const seatByNode = new Map();
const seatEls = new Map();

const theater = new Theater3D($("#scene"), {
  onSeatClick: (node) => handleSeatClick(node),
  onSeatHover: (node) => {
    seatEls.forEach((el) => el.classList.remove("hover3d"));
    if (node && seatEls.get(node)) seatEls.get(node).classList.add("hover3d");
  },
});

theater
  .load("assets/cinema_theater.glb", "assets/seats.json", (p) => { $("#loadingText").textContent = `Loading the hall… ${Math.round(p * 100)}%`; })
  .then((info) => {
    seatList = info.seats;
    seatList.forEach((s) => seatByNode.set(s.node, s));
    buildSeatMap();
    refreshShow();
    $("#viewerLoading").classList.add("hidden");
  })
  .catch((err) => {
    console.error(err);
    $("#loadingText").textContent = "Couldn't load the 3D hall. Serve this folder over http (not file://).";
  });

// ---------------- UI: movies / dates / times ----------------
function buildMovies() {
  const grid = $("#movieGrid"); grid.innerHTML = "";
  const chips = $("#movieChips"); chips.innerHTML = "";
  for (const m of MOVIES) {
    const card = document.createElement("article");
    card.className = "movie"; card.dataset.id = m.id;
    const poster = makeCanvas(400, 600, m, { poster: true }); poster.className = "poster";
    poster.setAttribute("role", "img"); poster.setAttribute("aria-label", `${m.title} poster`);
    card.appendChild(poster);
    const info = document.createElement("div"); info.className = "movie-info";
    info.innerHTML = `<h3>${m.title}</h3><div class="movie-meta">${m.genre}</div><div class="movie-meta">${m.runtime} · ${m.rating}</div><button class="btn btn-sm">Book tickets</button>`;
    info.querySelector("button").addEventListener("click", () => { selectMovie(m); $("#booking").scrollIntoView({ behavior: "smooth" }); });
    card.appendChild(info);
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
  state.movie = m;
  theater.setScreenImage(makeCanvas(2048, 858, m));
  refreshShow();
}

function markActive() {
  document.querySelectorAll("#movieChips .chip, .movie").forEach((el) => el.classList.toggle("active", el.dataset.id === state.movie.id));
  document.querySelectorAll("#dateChips .chip").forEach((el) => el.classList.toggle("active", el.dataset.date === state.date));
  document.querySelectorAll("#timeChips .chip").forEach((el) => el.classList.toggle("active", el.dataset.time === state.time));
  const d = new Date(state.date + "T00:00:00");
  $("#bookingMovieLabel").textContent = `${state.movie.title} · ${d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · ${state.time} · Hall 1`;
}

// a showtime changed: recompute taken seats, clear the selection
function refreshShow() {
  markActive();
  if (!seatList.length) return;
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
function buildSeatMap() {
  const map = $("#seatMap"); map.innerHTML = "";
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
      seatEls.set(s.node, b);
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
    const el = seatEls.get(s.node);
    el.className = "seat" + (st === "premium" ? " premium" : "") + (st === "selected" ? " selected" : "") + (st === "taken" ? " taken" : "") + (state.focus === s.node ? " focus" : "");
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
  theater.flyToSeat(node);
  showSeatInfo(node, taken);
  renderSeats();
  updateSummary();
}

function showSeatInfo(node, taken) {
  const s = seatByNode.get(node);
  const tier = priceFor(s.row);
  $("#hudSeat").textContent = `Row ${s.row} · Seat ${s.number}`;
  $("#hudHint").textContent = taken ? "Already taken — preview only" : `${tier.label} · ${fmtMoney(tier.price)} · drag to look around`;
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

$("#btnOverview").addEventListener("click", () => {
  state.focus = null;
  theater.flyToOverview();
  $("#hudSeat").textContent = "Overview";
  $("#hudHint").textContent = "Drag to look around · click a seat to see its view";
  $("#viewStats").hidden = true;
  renderSeats();
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
    <div><strong>${state.movie.title}</strong></div>
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
    <p>${escapeHtml(name || "")}, enjoy <strong>${state.movie.title}</strong> at ${state.time}.<br/>Seats ${list.map((s) => `${s.row}${s.number}`).join(", ")}.</p>
    <form method="dialog"><button class="btn">Done</button></form>`;
  $("#ticketModal").showModal();
  $("#checkoutForm").reset();
  list.forEach((s) => state.taken.add(s.node));
  state.selected.clear();
  renderSeats();
  updateSummary();
});
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

// ---------------- init ----------------
buildMovies();
buildDates();
buildTimes();
markActive();
document.fonts?.ready.then(() => buildMovies() || markActive());
theaterReady();
function theaterReady() {
  // paint the first movie on the screen once the model is in
  const iv = setInterval(() => { if (theater.screenMat) { theater.setScreenImage(makeCanvas(2048, 858, state.movie)); clearInterval(iv); } }, 200);
}
