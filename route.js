const originInput = document.getElementById("originSystem");
const destInput = document.getElementById("destSystem");
const routeBtn = document.getElementById("routeBtn");
const routeOutput = document.getElementById("route-output");
const totalJumps = document.getElementById("total-jumps");

let systems = [];
let systemKills = [];

// Load systems.json
fetch("systems.json")
  .then(res => res.json())
  .then(data => systems = data)
  .catch(err => console.error("Failed to load systems.json:", err));

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

  // Show or hide suggestions
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

// Initialize autocomplete for origin/dest
setupAutocomplete(originInput, "suggestions-origin");
setupAutocomplete(destInput, "suggestions-dest");

// Sleep helper for rate limiting
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// load cache from localStorage (or start fresh)
let killCache = JSON.parse(localStorage.getItem("killCache") || "{}");
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in ms

function saveCache() {
  localStorage.setItem("killCache", JSON.stringify(killCache));
}

async function getPvpKills(systemId, retries = 3, delay = 1000) {
  const now = Date.now();

  // check cache
  if (killCache[systemId] && now - killCache[systemId].time < CACHE_TTL) {
    console.log(`Using cached kills for system ID ${systemId}`);
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
        console.warn(`Rate limited on ${systemId}, attempt ${attempt}/${retries}`);
        await sleep(delay * attempt);
        continue;
      }

      const kills = await res.json();
      if (!Array.isArray(kills)) return 0;

      const pvpKills = kills.filter(k => k.zkb && !k.zkb.npc).length;

      // update cache
      killCache[systemId] = { time: now, kills: pvpKills };
      saveCache();

      return pvpKills;
    } catch (err) {
      console.error(`zKill fetch failed for ${systemId}, attempt ${attempt}`, err);
      await sleep(delay * attempt);
    }
  }

  return 0;
}

// Route fetch with batching and adaptive backoff
async function getRouteKills(route, batchSize = 5, delay = 1000) {
  console.log("getRouteKills called");
  const result = {};

  for (let i = 0; i < route.length; i += batchSize) {
    const batch = route.slice(i, i + batchSize);

    routeOutput.innerHTML = `<p>Fetching jumps ${i + 1}-${i + batch.length} of ${route.length}...</p>`;

    const batchResults = await Promise.all(
      batch.map(async (sysId) => [sysId, await getPvpKills(sysId, 5, delay)])
    );

    for (const [sysId, kills] of batchResults) {
      result[sysId] = kills;
    }

    if (i + batchSize < route.length) {
      await sleep(delay); // polite gap between batches
    }
  }

  return result;
}

// --- Wormhole support --- //
let whGraph = {}; // system_id -> array of connected system_ids (including wormholes)

// Build graph from systems.json (normal gates)
function buildGraph() {
  whGraph = {};
  systems.forEach(s => {
    whGraph[s.system_id] = s.neighbors || []; // assuming systems.json has a 'neighbors' array of system_ids
  });
}

// Fetch Thera/Turnur signatures and add wormhole edges
async function addWormholes() {
  const theraSignatures = await fetch('https://api.eve-scout.com/v2/public/signatures?system_name=thera').then(r => r.json());
  const turnurSignatures = await fetch('https://api.eve-scout.com/v2/public/signatures?system_name=turnur').then(r => r.json());

  [...theraSignatures, ...turnurSignatures].forEach(sig => {
    if (sig.signature_type === 'wormhole' && sig.completed && sig.remaining_hours > 1) {
      const from = sig.out_system_id;
      const to = sig.in_system_id;

      if (!whGraph[from]) whGraph[from] = [];
      whGraph[from].push(to); // wormhole edge

      // optionally bidirectional if K162 exits inward
      if (sig.wh_exits_outward) {
        if (!whGraph[to]) whGraph[to] = [];
        whGraph[to].push(from);
      }
    }
  });
}

// Simple BFS shortest path including wormholes
function shortestPath(startId, endId) {
  const queue = [[startId]];
  const visited = new Set();

  while (queue.length) {
    const path = queue.shift();
    const node = path[path.length - 1];

    if (node === endId) return path;

    if (!visited.has(node)) {
      visited.add(node);
      (whGraph[node] || []).forEach(neighbor => {
        queue.push([...path, neighbor]);
      });
    }
  }
  return null; // no path
}

// Rebuild graph and add wormholes before computing route
async function computeRouteWithWormholes(originId, destId) {
  buildGraph();
  await addWormholes();
  return shortestPath(originId, destId);
}

// Plan route
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

  // Get mode from radio
  const selectedRadio = document.querySelector("input[name='route-flag']:checked");
  let mode = "shortest"; // default
  if (selectedRadio) {
    if (selectedRadio.value === "secure") mode = "safer";
    else if (selectedRadio.value === "shortest") mode = "shortest";
    else if (selectedRadio.value === "shortest-gates-only") mode = "shortest-gates";
  }

  routeOutput.innerHTML = "<p>Fetching route...</p>";

  try {
    const routeIds = await computeRouteWithWormholes(originId, destId);
    if (!routeIds) {
      routeOutput.innerHTML = "<p>No route found (even with wormholes).</p>";
      return;
    }
    const routeKills = await getRouteKills(routeIds);

    let html = `<table>
      <tr><th>Jumps</th><th>System (Region)</th><th>Security</th><th>Kills (last hour)</th><th>zKillboard</th></tr>`;

    for (let i = 0; i < routeArray.length; i++) {
      const systemObj = routeArray[i];
      const sysId = systemObj.system_id;

      // fallback to API system object if local systems.json doesn't have it
      const system = systems.find(s => s.system_id === sysId) || systemObj;

      const sec = parseFloat(system.security_status.toFixed(1)).toFixed(1);
      const cls = secClass(sec);

      const kills = routeKills[sysId] || 0;
      const killClass = (kills >= 5) ? 'kills-high' : "";

      const specialStyle = (system.system === "Thera" || system.system === "Turnur") ? 'style="color: yellow;"' : '';

      html += `<tr ${specialStyle}>
        <td><b>${i}</b></td>
        <td>${system.system || system.system_name} <span class="region">(${system.region || system.region_name})</span></td>
        <td class="${cls}"><b>${sec}</b></td>
        <td><span class="${killClass}"><b>${kills}</b></span></td>
        <td><links><a href="https://zkillboard.com/system/${sysId}/" target="_blank">zKillboard</a></links></td>
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