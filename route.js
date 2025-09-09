let systemsData = {};
fetch("systems.json")
  .then(r => r.json())
  .then(data => {
    // Index systems by ID for fast lookup
    data.forEach(s => {
      systemsData[s.system_id] = s;
    });
  });

async function fetchRoute(originName, destName) {
  // Find system IDs from names
  let origin = Object.values(systemsData).find(s => s.system.toLowerCase() === originName.toLowerCase());
  let dest = Object.values(systemsData).find(s => s.system.toLowerCase() === destName.toLowerCase());

  if (!origin || !dest) {
    return alert("Origin or destination not found!");
  }

  // Get route
  let routeRes = await fetch(`https://esi.evetech.net/latest/route/${origin.system_id}/${dest.system_id}/`);
  let route = await routeRes.json();

  // Get jumps & kills
  let jumps = await (await fetch("https://esi.evetech.net/latest/universe/system_jumps/")).json();
  let kills = await (await fetch("https://esi.evetech.net/latest/universe/system_kills/")).json();

  let jumpsMap = {};
  jumps.forEach(j => jumpsMap[j.system_id] = j.ship_jumps);

  let killsMap = {};
  kills.forEach(k => killsMap[k.system_id] = k);

  // Render
  let output = document.getElementById("route-output");
  output.innerHTML = `
    <table>
      <tr>
        <th>System</th>
        <th>Security</th>
        <th>Jumps (last hour)</th>
        <th>Ship Kills</th>
        <th>Pod Kills</th>
        <th>NPC Kills</th>
      </tr>
      ${route.map(id => {
        let sys = systemsData[id];
        if (!sys) return "";
        let k = killsMap[id] || {};
        return `
          <tr>
            <td>${sys.system}</td>
            <td>${sys.security_status.toFixed(2)}</td>
            <td>${jumpsMap[id] || 0}</td>
            <td>${k.ship_kills || 0}</td>
            <td>${k.pod_kills || 0}</td>
            <td>${k.npc_kills || 0}</td>
          </tr>
        `;
      }).join("")}
    </table>
  `;
}

document.getElementById("routeBtn").addEventListener("click", () => {
  let origin = document.getElementById("origin").value.trim();
  let dest = document.getElementById("dest").value.trim();
  fetchRoute(origin, dest);
});



// Player count (EVE Online status API)
fetch("https://esi.evetech.net/latest/status/")
  .then(res => res.json())
  .then(data => {
    const playerCount = document.getElementById("onlineCounter");
    if (playerCount) playerCount.textContent = `TQ ${data.players.toLocaleString()}`;
    playerCount.style.color = "#00ff00";
  })
  .catch(() => {
    const playerCount = document.getElementById("onlineCounter");
    if (playerCount) playerCount.textContent = "Tranquility unreachable";
    playerCount.style.color = "#ff0000";
  });