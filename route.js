const originInput = document.getElementById("originSystem");
const destInput = document.getElementById("destSystem");
const routeBtn = document.getElementById("routeBtn");
const routeOutput = document.getElementById("route-output");

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

  routeOutput.innerHTML = "<p>Fetching route...</p>";

  try {
    // Call EVE route API
    const res = await fetch(`https://esi.evetech.net/latest/route/${originId}/${destId}`);
    const routeData = await res.json();

    if (!routeData || !routeData.length) {
      routeOutput.innerHTML = "<p>No route found.</p>";
      return;
    }

    // Build result table
    let html = `<table>
      <tr><th>Jumps</th><th>System (Region)</th><th>Security</th><th>Kills (last hour)</th></tr>`;

    for (let i = 0; i < routeData.length; i++) {
      const sysId = routeData[i];
      const system = systems.find(s => s.system_id === sysId);
      if (!system) continue;

      // Round security to 1 decimal place
      const sec = parseFloat(system.security_status.toFixed(1)).toFixed(1);

      // Call secClass function with above value as parameter to get color for displaying
      const cls = secClass(sec);

      // Get kills and determine if highlighting is needed
      const kills = getKills(sysId);
      const killClass = (kills >= 5) ? 'kills-high' : "";

      // Display system info in the table
      html += `<tr>
        <td><b>${i + 1}</b></td>
        <td>${system.system} <span class="region">(${system.region})</span></td>
        <td class="${cls}"><b>${sec}</b></td>
        <td><span class="${killClass}"><b>${kills}</b></span></td>
      </tr>`;
    }

    html += "</table>";
    routeOutput.innerHTML = html;

  } catch (err) {
    console.error(err);
    routeOutput.innerHTML = "<p>Error fetching route.</p>";
  }
});

// Autocomplete setup
function setupAutocomplete(input, suggestionsId) {
  const suggestionsDiv = document.getElementById(suggestionsId);
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
      });
      suggestionsDiv.appendChild(div);
    });
  });

  // Basically everything below is for keyboard navigation

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
        input.value = items[currentFocus].textContent.replace(/\s\(.+\)/, "");
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

// Initialize autocomplete for both inputs
setupAutocomplete(originInput, "suggestions-origin");
setupAutocomplete(destInput, "suggestions-dest");

// Player count
fetch("https://esi.evetech.net/latest/status/")
  .then(res => res.json())
  .then(data => {
    const playerCount = document.getElementById("onlineCounter");
    if (playerCount) {
      playerCount.textContent = `TQ ${data.players.toLocaleString()}`;
      playerCount.style.color = "#378937ff";
    }
  })
  .catch(() => {
    const playerCount = document.getElementById("onlineCounter");
    if (playerCount) {
      playerCount.textContent = "Tranquility unreachable";
      playerCount.style.color = "#9f3232ff";
    }
  });
