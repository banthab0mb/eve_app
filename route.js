// route.js
const originInput = document.getElementById("origin");
const destInput = document.getElementById("dest");
const routeBtn = document.getElementById("routeBtn");
const routeOutput = document.getElementById("route-output");

let systems = [];
let systemKills = [];

// Load systems.json once
fetch("systems.json")
  .then(res => res.json())
  .then(data => systems = data)
  .catch(err => console.error("Failed to load systems.json:", err));

// Load system kills once (cached for 1 hour)
fetch("https://esi.evetech.net/latest/universe/system_kills/")
  .then(res => res.json())
  .then(data => systemKills = data)
  .catch(err => console.error("Failed to load system kills:", err));

// Helper: get system ID from name
function getSystemId(name) {
  const system = systems.find(s => s.system.toLowerCase() === name.toLowerCase());
  return system ? system.system_id : null;
}

// Helper: get security status class
function secClass(sec) {
  if (sec >= 0.5) return "sec-high";
  if (sec > 0.0) return "sec-low";
  return "sec-null";
}

// Helper: get kills for a system
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
    const res = await fetch(`https://esi.evetech.net/latest/route/origin/${originId}/${destId}`);
    const routeData = await res.json();

    if (!routeData || !routeData.length) {
      routeOutput.innerHTML = "<p>No route found.</p>";
      return;
    }

    // Build table
    let html = `<table>
      <tr><th>Step</th><th>System (Region)</th><th>Security</th><th>Kills (last hour)</th></tr>`;

    for (let i = 0; i < routeData.length; i++) {
      const sysId = routeData[i];
      const system = systems.find(s => s.system_id === sysId);
      if (!system) continue;

      const sec = system.security_status;
      const cls = secClass(sec);
      const kills = getKills(sysId);

      html += `<tr>
        <td>${i + 1}</td>
        <td>${system.system} <span class="region">(${system.region})</span></td>
        <td class="${cls}">${sec.toFixed(2)}</td>
        <td>${kills}</td>
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
function renderSuggestions(query) {
    if (!suggestionsDiv || !input) return;
    suggestionsDiv.innerHTML = '';
    currentFocus = -1;

    if (!query) {
      hideSuggestions();
      return;
    }

    if (!systems || !systems.length) {
      // still loading or failed
      console.log('No systems loaded yet; suggestions unavailable');
      hideSuggestions();
      return;
    }

    const matches = systems
      .filter(s => s.system.toLowerCase().startsWith(query))
      .slice(0, 12);

    if (!matches.length) {
      hideSuggestions();
      return;
    }

    // ensure suggestions container gets the same width as the input
    // (works even if CSS not loaded correctly)
    const rect = input.getBoundingClientRect();
    suggestionsDiv.style.minWidth = `${rect.width}px`;

    matches.forEach((s, idx) => {
      const div = document.createElement('div');
      div.className = 'suggestion';
      div.setAttribute('data-idx', idx);
      // innerHTML includes the italic region span (style provided by CSS)
      div.innerHTML = `${escapeHtml(s.system)} <span class="region">(${escapeHtml(s.region || 'Unknown')})</span>`;
      div.style.cursor = 'pointer';

      div.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        input.value = s.system;
        hideSuggestions();
        input.focus();
      });
      suggestionsDiv.appendChild(div);
    });

    showSuggestionsContainer();
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
