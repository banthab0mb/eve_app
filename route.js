const originInput = document.getElementById("originSystem");
const destInput = document.getElementById("destSystem");
const routeBtn = document.getElementById("routeBtn");
const routeOutput = document.getElementById("route-output");
const totalJumps = document.getElementById("total-jumps");

let systems = [];
let stargates = [];
let wormholeConnections = []; // Eve-Scout WHs

const THERA_ID = 31000005;
const TURNUR_ID = 30002086;

// Load static data
Promise.all([
  fetch("systems.json").then(r => r.json()).then(data => systems = data),
  fetch("stargates.json").then(r => r.json()).then(data => stargates = data)
]).catch(err => console.error("Failed to load JSON:", err));

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

// Helper: get system ID
function getSystemId(name) {
  const system = systems.find(s => s.system.toLowerCase() === name.toLowerCase());
  return system ? system.system_id : null;
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

// Fetch Eve-Scout wormholes (Thera & Turnur)
async function addWormholes() {
  try {
    const [thera, turnur] = await Promise.all([
      fetch(`https://api.eve-scout.com/v2/public/signatures?system_name=thera`).then(r => r.json()),
      fetch(`https://api.eve-scout.com/v2/public/signatures?system_name=turnur`).then(r => r.json())
    ]);

    wormholeConnections = [...thera, ...turnur].filter(sig =>
      sig.signature_type === "wormhole" && sig.completed && sig.remaining_hours > 1
    );

    // Add WH connections to graph
    wormholeConnections.forEach(sig => {
      const from = sig.out_system_id;
      const to = sig.in_system_id;
      if (!whGraph[from]) whGraph[from] = [];
      if (!whGraph[to]) whGraph[to] = [];
      whGraph[from].push(to);
      whGraph[to].push(from);
    });
  } catch (e) {
    console.error("Failed to load wormholes:", e);
  }
}

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
    await addWormholes();

    const routeIds = shortestPath(originId, destId);
    if (!routeIds) { routeOutput.innerHTML = "<p>No route found.</p>"; return; }

    // Fetch PvP kills (1h) sequentially
    const routeKills = {};
    for (let sysId of routeIds) {
      routeKills[sysId] = await getPvpKills(sysId);
    }

    // Build table
    let html = `<table><tr><th>Jumps</th><th>System (Region)</th><th>Security</th><th>Kills</th><th>Info</th></tr>`;
    for (let i = 0; i < routeIds.length; i++) {
      const sysId = routeIds[i];
      const system = systems.find(s => s.system_id === sysId) || { system: "Unknown", region: "Unknown", security_status: 0 };
      const sec = parseFloat(system.security_status).toFixed(1);
      const cls = secClass(sec);
      const kills = routeKills[sysId] || 0;
      const killClass = kills >= 5 ? "kills-high" : "";

      // Highlight Thera & Turnur
      const highlightClass = sysId === THERA_ID ? "thera-highlight" : sysId === TURNUR_ID ? "turnur-highlight" : "";

      // Info column
      let info = '';
      if (i === 0) info = 'Start';
      else if (i === routeIds.length - 1) info = 'Destination';
      else {
        const wh = wormholeConnections.find(w => w.out_system_id === sysId || w.in_system_id === sysId);
        if (wh) {
          const sig = wh.signature || 'WH';
          const type = wh.type || '';
          const ageMins = Math.floor((Date.now() - new Date(wh.updated_at)) / 60000);
          const ageStr = ageMins >= 60 ? `${Math.floor(ageMins/60)}h ${ageMins%60}m` : `${ageMins}m`;
          info = `${sig} (${type}) age ${ageStr}`;
        }
      }

      html += `<tr class="${highlightClass}">
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