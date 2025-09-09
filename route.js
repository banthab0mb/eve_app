const originInput = document.getElementById("origin");
const destInput = document.getElementById("dest");
const routeBtn = document.getElementById("routeBtn");
const routeOutput = document.getElementById("route-output");

let systems = [];

// Load systems.json for name/id lookup
fetch("systems.json")
  .then(res => res.json())
  .then(data => systems = data)
  .catch(err => console.error("Failed to load systems.json:", err));

// Helper to get system object by name
function getSystemByName(name) {
  return systems.find(s => s.system.toLowerCase() === name.toLowerCase());
}

// Helper for sec status class
function secClass(sec) {
  if (sec >= 0.5) return "sec-high";
  if (sec > 0) return "sec-low";
  return "sec-null";
}

routeBtn.addEventListener("click", async () => {
  const origin = getSystemByName(originInput.value.trim());
  const destination = getSystemByName(destInput.value.trim());

  if (!origin || !destination) {
    routeOutput.innerHTML = "<p>Please enter valid origin and destination systems.</p>";
    return;
  }

  try {
    // ESI route API: https://esi.evetech.net/latest/universe/route/
    const routeResp = await fetch(
      `https://esi.evetech.net/latest/route/${origin.system_id}/${destination.system_id}/?flag=shortest&datasource=tranquility`
    );
    const route = await routeResp.json();

    // Build table
    let html = `<table>
      <tr>
        <th>System</th>
        <th>Constellation</th>
        <th>Region</th>
        <th>Security</th>
      </tr>`;

    route.forEach(sysId => {
      const sys = systems.find(s => s.system_id === sysId);
      if (sys) {
        html += `<tr>
          <td>${sys.system}</td>
          <td>${sys.constellation}</td>
          <td>${sys.region}</td>
          <td class="${secClass(sys.security_status)}">${sys.security_status.toFixed(2)}</td>
        </tr>`;
      }
    });

    html += `</table>`;
    routeOutput.innerHTML = html;

  } catch (err) {
    console.error(err);
    routeOutput.innerHTML = "<p>Error fetching route.</p>";
  }
});




// Player count (EVE Online status API)
fetch("https://esi.evetech.net/latest/status/")
  .then(res => res.json())
  .then(data => {
    const playerCount = document.getElementById("onlineCounter");
    if (playerCount) playerCount.textContent = `TQ ${data.players.toLocaleString()}`;
    playerCount.style.color = "#378937ff";
  })
  .catch(() => {
    const playerCount = document.getElementById("onlineCounter");
    if (playerCount) playerCount.textContent = "Tranquility unreachable";
    playerCount.style.color = "#9f3232ff";
  });