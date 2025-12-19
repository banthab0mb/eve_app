const originInput = document.getElementById("originSystem");
const destInput = document.getElementById("destSystem");
const routeBtn = document.getElementById("routeBtn");
const routeOutput = document.getElementById("route-output");
const totalJumps = document.getElementById("total-jumps");

let systems = [];
let stargates = [];

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

  // 1. Hide suggestions when clicking outside the input or suggestions box
  document.addEventListener("click", (e) => {
    if (e.target !== input && e.target !== suggestionsDiv) {
      suggestionsDiv.style.display = "none";
      suggestionsDiv.innerHTML = "";
    }
  });

  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    
    // 2. Hide if input is cleared
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
        
        // 3. Hide after selection
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
        // Hide on Enter key
        suggestionsDiv.innerHTML = ""; 
        suggestionsDiv.style.display = "none";
      } 
    }
    else if (e.key === "Escape") {
      // Allow user to close suggestions with Escape key
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

// Cache
let killCache = JSON.parse(localStorage.getItem("killCache") || "{}");
const CACHE_TTL = 60 * 60 * 1000;
function saveCache() { localStorage.setItem("killCache", JSON.stringify(killCache)); }

// Fetch PvP kills (zKill)
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

// Route kills sequential (mobile-safe)
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

// Add wormholes
async function addWormholes() {
  const thera = await fetch("https://api.eve-scout.com/v2/public/signatures?system_name=thera").then(r => r.json());
  const turnur = await fetch("https://api.eve-scout.com/v2/public/signatures?system_name=turnur").then(r => r.json());
  [...thera, ...turnur].forEach(sig => {
    if (sig.signature_type === "wormhole" && sig.completed && sig.remaining_hours > 1) {
      const from = sig.out_system_id;
      const to = sig.in_system_id;
      if (!whGraph[from]) whGraph[from] = [];
      whGraph[from].push(to);
      if (!whGraph[to]) whGraph[to] = [];
      whGraph[to].push(from);
    }
  });
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
  const selectedRadio = document.querySelector("input[name='route-flag']:checked");
  const mode = selectedRadio ? selectedRadio.value : "shortest";
  const allowWormholes = !(mode === "secure" || mode === "shortest-gates-only");

  try {
    buildGraph();
    if (allowWormholes) await addWormholes();

    const routeIds = shortestPath(originId, destId);
    if (!routeIds) { routeOutput.innerHTML = "<p>No route found.</p>"; return; }

    const routeKills = await getRouteKills(routeIds);

    let html = `<table><tr><th>Jumps</th><th>System (Region)</th><th>Security</th><th>Kills</th><th>zKill</th></tr>`;
    for (let i = 0; i < routeIds.length; i++) {
      const sysId = routeIds[i];
      const system = systems.find(s => s.system_id === sysId) || { system: "Unknown", region: "Unknown", security_status: 0 };
      const sec = parseFloat(system.security_status).toFixed(1);
      const cls = secClass(sec);
      const kills = routeKills[sysId] || 0;
      const killClass = kills >= 5 ? "kills-high" : "";
      const highlight = (system.system === "Thera" || system.system === "Turnur") ? '<span class="highlight-system">' : '';
      const endHighlight = highlight ? '</span>' : '';
      html += `<tr>
        <td><b>${i}</b></td>
        <td>${highlight}${system.system}${endHighlight} <span class="region">(${system.region})</span></td>
        <td class="${cls}"><b>${sec}</b></td>
        <td><span class="${killClass}"><b>${kills}</b></span></td>
        <td><links><a href="https://zkillboard.com/system/${sysId}/" target="_blank">zKillboard</a></links></td>
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