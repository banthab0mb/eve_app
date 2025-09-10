// route.js
const originInput = document.getElementById("originSystem");
const destInput = document.getElementById("destSystem");
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
