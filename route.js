// DOM Elements
const originInput = document.getElementById("originSystem");
const destInput = document.getElementById("destSystem");
const routeBtn = document.getElementById("routeBtn");
const routeOutput = document.getElementById("route-output");
const totalJumps = document.getElementById("total-jumps");

const avoidInput = document.getElementById("avoidSystem");
const avoidTagsDiv = document.getElementById("avoid-tags");
const addWaypointBtn = document.getElementById("add-waypoint-btn");
const waypointContainer = document.getElementById("waypoint-container");

const FAVORITES_KEY = "eve_route_favorites";
const THERA_ID = 31000005;
const TURNUR_ID = 30002086;

// Data
let systems = [];
let stargates = [];
let whGraph = {};
let avoidList = new Set([TURNUR_ID]); // Optional default
let killCache = JSON.parse(localStorage.getItem("killCache") || "{}");
const CACHE_TTL = 60 * 60 * 1000;

// Load static data
Promise.all([
  fetch("systems.json").then(r => r.json()).then(data => systems = data),
  fetch("stargates.json").then(r => r.json()).then(data => stargates = data)
]).catch(err => console.error("Failed to load JSON:", err));

// --- Helpers ---
function getSystemId(name) {
  const s = systems.find(s => s.system.toLowerCase() === name.toLowerCase());
  return s ? s.system_id : null;
}

function secClass(sec) {
  if (sec >= 1) return "sec-blue";
  if (sec >= 0.9) return "sec-lighter-blue";
  if (sec >= 0.8) return "sec-high-blue";
  if (sec >= 0.7) return "sec-sea";
  if (sec >= 0.6) return "sec-green";
  if (sec >= 0.5) return "sec-yellow";
  if (sec >= 0.4) return "sec-low";
  if (sec >= 0.3) return "sec-rorange";
  if (sec >= 0.2) return "sec-red";
  if (sec >= 0.1) return "sec-purple";
  return "sec-null";
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function saveCache() { localStorage.setItem("killCache", JSON.stringify(killCache)); }

// --- Autocomplete ---
function setupAutocomplete(input, suggestionsId, callback = null) {
  const suggestionsDiv = document.getElementById(suggestionsId) || document.createElement("div");
  suggestionsDiv.classList.add("suggestions");
  if (!suggestionsDiv.id) suggestionsDiv.id = suggestionsId;
  if (!suggestionsDiv.parentNode) input.parentNode.appendChild(suggestionsDiv);

  let currentFocus = -1;

  document.addEventListener("click", (e) => {
    if (e.target !== input && e.target !== suggestionsDiv) {
      suggestionsDiv.style.display = "none";
      suggestionsDiv.innerHTML = "";
    }
  });

  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    if (!query) return (suggestionsDiv.style.display = "none", suggestionsDiv.innerHTML = "");

    const matches = systems.filter(s => s.system.toLowerCase().startsWith(query)).slice(0, 10);
    if (!matches.length) return suggestionsDiv.style.display = "none";

    suggestionsDiv.innerHTML = "";
    matches.forEach(s => {
      const div = document.createElement("div");
      div.classList.add("suggestion");
      div.innerHTML = `${s.system} <span class="region">(${s.region})</span>`;
      div.addEventListener("click", () => {
        input.value = s.system;
        suggestionsDiv.innerHTML = "";
        suggestionsDiv.style.display = "none";
        if (callback) callback(s.system);
      });
      suggestionsDiv.appendChild(div);
    });
    suggestionsDiv.style.display = "block";
  });

  input.addEventListener("keydown", e => {
    const items = suggestionsDiv.querySelectorAll(".suggestion");
    if (!items.length) return;
    if (e.key === "ArrowDown") currentFocus = (currentFocus + 1) % items.length;
    else if (e.key === "ArrowUp") currentFocus = (currentFocus - 1 + items.length) % items.length;
    else if (e.key === "Enter") {
      e.preventDefault();
      if (currentFocus > -1) input.value = items[currentFocus].textContent.replace(/\s\(.+\)/, "");
      suggestionsDiv.style.display = "none";
    }
    items.forEach(el => el.classList.remove("active"));
    if (currentFocus > -1) items[currentFocus].classList.add("active");
  });
}

setupAutocomplete(originInput, "suggestions-origin");
setupAutocomplete(destInput, "suggestions-dest");
setupAutocomplete(avoidInput, "suggestions-avoid", addSystemToAvoidList);

// --- Waypoints & Avoid ---
function addWaypoint(name = "") {
  const div = document.createElement("div");
  div.className = "waypoint-item";
  div.innerHTML = `
    <input type="text" value="${name}" placeholder="System name">
    <button class="remove-waypoint-btn">×</button>
  `;
  const input = div.querySelector("input");
  const btn = div.querySelector("button");
  btn.onclick = () => { div.remove(); };
  waypointContainer.appendChild(div);
}

function addSystemToAvoidList(name) {
  const id = getSystemId(name);
  if (id && !avoidList.has(id)) {
    avoidList.add(id);
    renderAvoidList();
  }
}

function renderAvoidList() {
  avoidTagsDiv.innerHTML = "";
  avoidList.forEach(id => {
    const sys = systems.find(s => s.system_id === id);
    if (!sys) return;
    const tag = document.createElement("div");
    tag.className = "avoid-tag";
    tag.textContent = `${sys.system} ✖`;
    tag.onclick = () => { avoidList.delete(id); renderAvoidList(); };
    avoidTagsDiv.appendChild(tag);
  });
}

// --- Graph ---
function buildGraph() {
  whGraph = {};
  stargates.forEach(g => {
    if (!whGraph[g.from_system]) whGraph[g.from_system] = [];
    whGraph[g.from_system].push(g.to_system);
  });
}

async function addWormholes() {
  const thera = await fetch("https://api.eve-scout.com/v2/public/signatures?system_name=thera").then(r => r.json());
  const turnur = await fetch("https://api.eve-scout.com/v2/public/signatures?system_name=turnur").then(r => r.json());
  [...thera, ...turnur].forEach(sig => {
    if (sig.signature_type === "wormhole" && sig.completed && sig.remaining_hours > 1) {
      const from = sig.out_system_id, to = sig.in_system_id;
      if (!whGraph[from]) whGraph[from] = [];
      if (!whGraph[to]) whGraph[to] = [];
      whGraph[from].push(to);
      whGraph[to].push(from);
    }
  });
}

// --- Route calculation ---
function shortestPath(startId, endId) {
  const queue = [[startId]];
  const visited = new Set();
  while (queue.length) {
    const path = queue.shift();
    const node = path[path.length - 1];
    if (node === endId) return path;
    if (!visited.has(node)) {
      visited.add(node);
      (whGraph[node] || []).forEach(n => queue.push([...path, n]));
    }
  }
  return null;
}

// --- zKill ---
async function getPvpKills(systemId) {
  const now = Date.now();
  if (killCache[systemId] && now - killCache[systemId].time < CACHE_TTL) return killCache[systemId].kills;
  try {
    const res = await fetch(`https://zkillboard.com/api/kills/systemID/${systemId}/pastSeconds/3600/`);
    const data = await res.json();
    const kills = data.filter(k => k.zkb && !k.zkb.npc).length;
    killCache[systemId] = { time: now, kills };
    saveCache();
    return kills;
  } catch { return 0; }
}

async function getRouteKills(route) {
  const result = {};
  for (const id of route) result[id] = await getPvpKills(id);
  return result;
}

// --- Route button ---
routeBtn.addEventListener("click", async () => {
  const originId = getSystemId(originInput.value.trim());
  const destId = getSystemId(destInput.value.trim());
  if (!originId || !destId) return routeOutput.innerHTML = "<p>Invalid origin or destination.</p>";

  routeOutput.innerHTML = "<p>Calculating route...</p>";
  buildGraph();
  await addWormholes();

  const wpIds = Array.from(waypointContainer.querySelectorAll("input")).map(inp => getSystemId(inp.value.trim())).filter(Boolean);
  const routeIds = [originId, ...wpIds, destId];

  let fullRoute = [];
  for (let i = 0; i < routeIds.length - 1; i++) {
    const segment = shortestPath(routeIds[i], routeIds[i+1]);
    if (!segment) return routeOutput.innerHTML = "<p>No route found.</p>";
    fullRoute = fullRoute.concat(i === 0 ? segment : segment.slice(1));
  }

  const routeKills = await getRouteKills(fullRoute);

  let html = `<table>
    <tr><th>Jump</th><th>System</th><th>Security</th><th>Kills</th><th>zKill</th></tr>`;
  fullRoute.forEach((sysId, idx) => {
    const sys = systems.find(s => s.system_id === sysId) || { system: "Unknown", region: "Unknown", security_status: 0 };
    const kills = routeKills[sysId] || 0;
    const killClass = kills >= 5 ? "kills-high" : "";
    html += `<tr>
      <td>${idx}</td>
      <td>${sys.system} <span class="region">(${sys.region})</span></td>
      <td class="${secClass(sys.security_status)}">${sys.security_status.toFixed(1)}</td>
      <td class="${killClass}">${kills}</td>
      <td><a href="https://zkillboard.com/system/${sysId}/" target="_blank">zKill</a></td>
    </tr>`;
  });
  html += "</table>";
  routeOutput.innerHTML = html;
  totalJumps.textContent = `Total Jumps: ${fullRoute.length - 1}`;
});
