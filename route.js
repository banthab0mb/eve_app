const originInput = document.getElementById("originSystem");
const destInput = document.getElementById("destSystem");
const routeBtn = document.getElementById("routeBtn");
const routeOutput = document.getElementById("route-output");
const totalJumps = document.getElementById("total-jumps");

let systems = [];
let stargates = [];
let wormholeConnections = [];

const THERA_ID = 31000005;
const TURNUR_ID = 30002086;

// Load static data
Promise.all([
  fetch("systems.json").then(r => r.json()).then(data => systems = data),
  fetch("stargates.json").then(r => r.json()).then(data => stargates = data)
]).catch(err => console.error("Failed to load JSON:", err));

// Helper: get system ID
function getSystemId(name) {
  const system = systems.find(s => s.system.toLowerCase() === name.toLowerCase());
  return system ? system.system_id : null;
}

// Security colors
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

// Autocomplete
function setupAutocomplete(input, suggestionsId) {
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
    if (!query) {
      suggestionsDiv.style.display = "none";
      suggestionsDiv.innerHTML = "";
      return;
    }

    const matches = systems.filter(s => s.system.toLowerCase().startsWith(query)).slice(0, 10);
    if (matches.length > 0) {
      suggestionsDiv.innerHTML = "";
      matches.forEach(s => {
        const div = document.createElement("div");
        div.classList.add("suggestion");
        div.innerHTML = `${s.system} <span class="region">(${s.region})</span>`;
        div.addEventListener("click", () => {
          input.value = s.system;
          suggestionsDiv.innerHTML = "";
          suggestionsDiv.style.display = "none";
        });
        suggestionsDiv.appendChild(div);
      });
      suggestionsDiv.style.display = "block";
    } else {
      suggestionsDiv.style.display = "none";
    }
  });

  input.addEventListener("keydown", e => {
    const items = suggestionsDiv.querySelectorAll(".suggestion");
    if (!items.length) return;

    if (e.key === "ArrowDown") { 
      currentFocus++; 
      if (currentFocus >= items.length) currentFocus = 0; 
      setActive(items); 
      e.preventDefault(); 
    }
    else if (e.key === "ArrowUp") { 
      currentFocus--; 
      if (currentFocus < 0) currentFocus = items.length - 1; 
      setActive(items); 
      e.preventDefault(); 
    }
    else if (e.key === "Enter") { 
      e.preventDefault(); 
      if (currentFocus > -1) { 
        input.value = items[currentFocus].textContent.replace(/\s\(.+\)/, ""); 
        suggestionsDiv.innerHTML = ""; 
        suggestionsDiv.style.display = "none";
      } 
    }
    else if (e.key === "Escape") {
      suggestionsDiv.style.display = "none";
    }
  });

  function setActive(items) {
    items.forEach(el => el.classList.remove("active"));
    if (currentFocus > -1) items[currentFocus].classList.add("active");
  }
}

setupAutocomplete(originInput, "suggestions-origin");
setupAutocomplete(destInput, "suggestions-dest");

// Sleep helper
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// Cache for kills
let killCache = JSON.parse(localStorage.getItem("killCache") || "{}");
const CACHE_TTL = 60 * 60 * 1000;
function saveCache() { localStorage.setItem("killCache", JSON.stringify(killCache)); }

// Fetch PvP kills
async function getPvpKills(systemId, retries = 3, delay = 1000) {
  const now = Date.now();
  if (killCache[systemId] && now - killCache[systemId].time < CACHE_TTL) return killCache[systemId].kills;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`https://zkillboard.com/api/kills/systemID/${systemId}/pastSeconds/3600/`, {
        headers: { "Accept-Encoding": "gzip", "User-Agent": "https://banthab0mb.github.io/eve_app/ Maintainer: banthab0mb@gmail.com" }
      });
      if (!res.ok) await sleep(delay * attempt);
      const kills = await res.json();
      if (!Array.isArray(kills)) return 0;
      const pvpKills = kills.filter(k => k.zkb && !k.zkb.npc).length;
      killCache[systemId] = { time: now, kills: pvpKills };
      saveCache();
      return pvpKills;
    } catch { await sleep(delay * attempt); }
  }
  return 0;
}

// Route kills sequential
async function getRouteKills(route) {
  const result = {};
  for (let id of route) result[id] = await getPvpKills(id);
  return result;
}

// Build graph
let whGraph = {};
function buildGraph() {
  whGraph = {};
  stargates.forEach(g => {
    if (!whGraph[g.from_system]) whGraph[g.from_system] = [];
    whGraph[g.from_system].push(g.to_system);
  });
}

// Fetch wormholes from Eve-Scout
async function fetchWormholes() {
  try {
    const [theraRes, turnurRes] = await Promise.all([
      fetch(`https://api.eve-scout.com/v2/public/signatures?system_name=thera`).then(r => r.json()),
      fetch(`https://api.eve-scout.com/v2/public/signatures?system_name=turnur`).then(r => r.json())
    ]);

    const whs = [...theraRes, ...turnurRes].filter(sig => sig.signature_type === "wormhole" && sig.completed && sig.remaining_hours > 1);
    wormholeConnections = whs;

    whs.forEach(sig => {
      const from = sig.out_system_id;
      const to = sig.in_system_id;
      if (!whGraph[from]) whGraph[from] = [];
      if (!whGraph[to]) whGraph[to] = [];
      whGraph[from].push(to);
      whGraph[to].push(from);
    });
  } catch (e) {
    console.error("Failed to fetch wormholes:", e);
  }
}

// BFS shortest path
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

// Route button
routeBtn.addEventListener("click", async () => {
  const originName = originInput.value.trim();
  const destName = destInput.value.trim();
  if (!originName || !destName) return;

  const originId = getSystemId(originName);
  const destId = getSystemId(destName);
  if (!originId || !destId) { routeOutput.innerHTML = "<p>Origin or destination system not found!</p>"; return; }

  routeOutput.innerHTML = "<p>Fetching route...</p>";

  try {
    buildGraph();
    await fetchWormholes();

    const routeIds = shortestPath(originId, destId);
    if (!routeIds) { routeOutput.innerHTML = "<p>No route found.</p>"; return; }

    const routeKills = await getRouteKills(routeIds);

    let html = `<table>
      <tr>
        <th>Jumps</th>
        <th>System (Region)</th>
        <th>Security</th>
        <th>Kills</th>
        <th>Info</th>
      </tr>`;

    for (let i = 0; i < routeIds.length; i++) {
      const sysId = routeIds[i];
      const system = systems.find(s => s.system_id === sysId) || { system: "Unknown", region: "Unknown", security_status: 0 };
      const sec = parseFloat(system.security_status).toFixed(1);
      const cls = secClass(sec);
      const kills = routeKills[sysId] || 0;
      const killClass = kills >= 5 ? "kills-high" : "";

      let info = '';
      if (i === 0) info = 'Start';
      else if (i === routeIds.length - 1) info = 'Destination';
      else {
        const wh = wormholeConnections.find(w => (w.out_system_id === sysId || w.in_system_id === sysId));
        if (wh) {
          const sig = wh.signature || 'WH';
          const type = wh.type || '';
          const ageMins = Math.floor((Date.now() - new Date(wh.updated_at)) / 60000);
          const ageStr = ageMins >= 60 ? `${Math.floor(ageMins/60)}h ${ageMins%60}m` : `${ageMins}m`;
          info = `${sig} (${type}) age ${ageStr}`;
        }
      }

      html += `<tr>
        <td><b>${i}</b></td>
        <td>${system.system} <span class="region">(${system.region})</span></td>
        <td class="${cls}"><b>${sec}</b></td>
        <td><span class="${killClass}"><b>${kills}</b></span></td>
        <td>${info}</td>
      </tr>`;
    }

    html += "</table>";
    totalJumps.innerHTML = `Total Jumps: ${routeIds.length - 1}`;
    routeOutput.innerHTML = html;

  } catch (err) {
    console.error(err);
    routeOutput.innerHTML = "<p>Error fetching route.</p>";
  }
});
