const originInput = document.getElementById("originSystem");
const destInput = document.getElementById("destSystem");
const routeBtn = document.getElementById("routeBtn");
const routeOutput = document.getElementById("route-output");
const totalJumps = document.getElementById("total-jumps");

let systems = [];
let systemKills = [];
let stargates = [];

// Load systems.json
fetch("systems.json")
  .then(res => res.json())
  .then(data => systems = data)
  .catch(err => console.error("Failed to load systems.json:", err));

// Load stargates.json (new!)
fetch("stargates.json")
  .then(res => res.json())
  .then(data => stargates = data)
  .catch(err => console.error("Failed to load stargates.json:", err));

// Load system kills
fetch("https://esi.evetech.net/latest/universe/system_kills/")
  .then(res => res.json())
  .then(data => systemKills = data)
  .catch(err => console.error("Failed to load system kills:", err));

// Helper: get system ID from name
function getSystemId(name) {
  const system = systems.find(s => s.system.toLowerCase() === name.toLowerCase());
  return system ? system.system_id : null;
}

// Get color value for security status
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

// Get kills in the system
function getKills(systemId) {
  const entry = systemKills.find(s => s.system_id === systemId);
  return entry ? entry.ship_kills : 0;
}

// Autocomplete setup
function setupAutocomplete(input, suggestionsId) {
  const suggestionsDiv = document.getElementById(suggestionsId) || document.createElement("div");
  suggestionsDiv.classList.add("suggestions");
  if (!suggestionsDiv.id) suggestionsDiv.id = suggestionsId;
  if (!suggestionsDiv.parentNode) input.parentNode.appendChild(suggestionsDiv);

  let currentFocus = -1;

  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    suggestionsDiv.innerHTML = "";
    if (!query) return;

    const matches = systems.filter(s => s.system.toLowerCase().startsWith(query)).slice(0, 10);

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

    suggestionsDiv.style.display = matches.length ? "block" : "none";
  });

  input.addEventListener("keydown", e => {
    const items = suggestionsDiv.querySelectorAll(".suggestion");
    if (!items.length) return;

    if (e.key === "ArrowDown") {
      currentFocus++;
      if (currentFocus >= items.length) currentFocus = 0;
      setActive(items);
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      currentFocus--;
      if (currentFocus < 0) currentFocus = items.length - 1;
      setActive(items);
      e.preventDefault();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (currentFocus > -1) {
        const systemName = items[currentFocus].textContent.replace(/\s\(.+\)/, "");
        input.value = systemName;
        suggestionsDiv.innerHTML = "";
      }
    }
  });

  function setActive(items) {
    items.forEach(el => el.classList.remove("active"));
    if (currentFocus > -1) items[currentFocus].classList.add("active");
  }

  document.addEventListener("click", e => {
    if (e.target !== input) suggestionsDiv.innerHTML = "";
  });
}

// Initialize autocomplete
setupAutocomplete(originInput, "suggestions-origin");
setupAutocomplete(destInput, "suggestions-dest");

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Cache setup
let killCache = JSON.parse(localStorage.getItem("killCache") || "{}");
const CACHE_TTL = 60 * 60 * 1000;
function saveCache() {
  localStorage.setItem("killCache", JSON.stringify(killCache));
}

// Fetch PvP kills (zKill)
async function getPvpKills(systemId, retries = 3, delay = 1000) {
  const now = Date.now();

  if (killCache[systemId] && now - killCache[systemId].time < CACHE_TTL) {
    return killCache[systemId].kills;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(
        `https://zkillboard.com/api/kills/systemID/${systemId}/pastSeconds/3600/`,
        {
          headers: {
            "Accept-Encoding": "gzip",
            "User-Agent": "https://banthab0mb.github.io/eve_app/ Maintainer: banthab0mb@gmail.com"
          }
        }
      );

      if (res.status === 429) {
        await sleep(delay * attempt);
        continue;
      }

      const kills = await res.json();
      if (!Array.isArray(kills)) return 0;

      const pvpKills = kills.filter(k => k.zkb && !k.zkb.npc).length;

      killCache[systemId] = { time: now, kills: pvpKills };
      saveCache();

      return pvpKills;
    } catch {
      await sleep(delay * attempt);
    }
  }

  return 0;
}

// Route kills with batching
async function getRouteKills(route, batchSize = 5, delay = 1000) {
  const result = {};
  for (let i = 0; i < route.length; i += batchSize) {
    const batch = route.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(async id => [id, await getPvpKills(id, 5, delay)]));
    for (const [sysId, kills] of batchResults) result[sysId] = kills;
    if (i + batchSize < route.length) await sleep(delay);
  }
  return result;
}

// Graph for routes
let whGraph = {};

// Build base graph using stargates.json
function buildGraph() {
  whGraph = {};
  stargates.forEach(g => {
    if (!whGraph[g.from_system]) whGraph[g.from_system] = [];
    whGraph[g.from_system].push(g.to_system);
  });
  console.log("Graph built from stargates.json:", Object.keys(whGraph).length);
}

// Add wormhole edges (Thera + Turnur)
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
  console.log("Added wormholes to graph");
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

// Full route computation
async function computeRouteWithWormholes(originId, destId) {
  buildGraph();
  await addWormholes();
  return shortestPath(originId, destId);
}

// Route button logic
routeBtn.addEventListener("click", async () => {
  const originName = originInput.value.trim();
  const destName = destInput.value.trim();
  if (!originName || !destName) return;

  const originId = getSystemId(originName);
  const destId = getSystemId(destName);

  if (!originId || !destId) {
    routeOutput.innerHTML = "<p>Origin or destination system not found!</p>";
    return;
  }

  routeOutput.innerHTML = "<p>Fetching route...</p>";

  try {
    const routeIds = await computeRouteWithWormholes(originId, destId);
    if (!routeIds) {
      routeOutput.innerHTML = "<p>No route found (even with wormholes).</p>";
      return;
    }

    const routeKills = await getRouteKills(routeIds);
    let html = `<table><tr><th>Jumps</th><th>System (Region)</th><th>Security</th><th>Kills</th><th>zKill</th></tr>`;

    for (let i = 0; i < routeIds.length; i++) {
      const sysId = routeIds[i];
      const system = systems.find(s => s.system_id === sysId) || { system: "Unknown", region: "Unknown", security_status: 0 };
      const sec = parseFloat(system.security_status.toFixed(1)).toFixed(1);
      const cls = secClass(sec);
      const kills = routeKills[sysId] || 0;
      const killClass = kills >= 5 ? "kills-high" : "";
      const highlight = (system.system === "Thera" || system.system === "Turnur") ? 'style="color: yellow;"' : "";

      html += `<tr ${highlight}>
        <td><b>${i + 1}</b></td>
        <td>${system.system} <span class="region">(${system.region})</span></td>
        <td class="${cls}"><b>${sec}</b></td>
        <td><span class="${killClass}"><b>${kills}</b></span></td>
        <td><a href="https://zkillboard.com/system/${sysId}/" target="_blank">zKillboard</a></td>
      </tr>`;
    }

    totalJumps.innerHTML = `Total Jumps: ${routeIds.length - 1}`;
    html += "</table>";
    routeOutput.innerHTML = html;

  } catch (err) {
    console.error(err);
    routeOutput.innerHTML = "<p>Error fetching route.</p>";
  }
});