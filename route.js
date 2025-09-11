const originInput = document.getElementById("originSystem");
const destInput = document.getElementById("destSystem");
const routeBtn = document.getElementById("routeBtn");
const routeOutput = document.getElementById("route-output");
const avoidContainer = document.getElementById("avoid-container");

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

// Collect avoidance IDs
function getAvoidIds() {
  const tags = avoidContainer.querySelectorAll(".avoid-tag");
  return Array.from(tags).map(tag => tag.dataset.id);
}

// Add avoidance tag + new input
function addAvoidTag(systemName) {
  const sysId = getSystemId(systemName);
  if (!sysId) return;

  // Prevent duplicates
  if (getAvoidIds().includes(String(sysId))) return;

  const tag = document.createElement("span");
  tag.classList.add("avoid-tag");
  tag.textContent = systemName;
  tag.dataset.id = sysId;

  const removeBtn = document.createElement("button");
  removeBtn.textContent = "×";
  removeBtn.classList.add("remove-btn");
  removeBtn.addEventListener("click", () => tag.remove());

  tag.appendChild(removeBtn);
  avoidContainer.insertBefore(tag, avoidContainer.querySelector(".search-group:last-child"));

  // Always ensure a fresh input exists
  if (!avoidContainer.querySelector(".search-group input").value) return;
  createAvoidInput();
}

// Create new avoid input
function createAvoidInput() {
  const group = document.createElement("div");
  group.classList.add("search-group");

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Avoid system";

  const suggestionsDiv = document.createElement("div");
  suggestionsDiv.classList.add("suggestions");

  group.appendChild(input);
  group.appendChild(suggestionsDiv);
  avoidContainer.appendChild(group);

  setupAutocomplete(input, suggestionsDiv.id = `suggestions-${Date.now()}`);

  // On Enter, add system as tag
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = input.value.trim();
      if (val) {
        addAvoidTag(val);
        input.value = "";
      }
    }
  });
}

// Plan route
routeBtn.addEventListener("click", async () => {
  const originName = originInput.value.trim();
  const destName = destInput.value.trim();

  if (!originName || !destName) return;

  const originId = getSystemId(originName);
  const destId = getSystemId(destName);
  const avoidIds = getAvoidIds();

  if (!originId || !destId) {
    routeOutput.innerHTML = "<p>Origin or destination system not found!</p>";
    return;
  }

  // Get selected flag
  const flag = document.querySelector("input[name='route-flag']:checked").value;

  routeOutput.innerHTML = "<p>Fetching route...</p>";

  try {
    // Build query params
    let url = `https://esi.evetech.net/latest/route/${originId}/${destId}?flag=${flag}`;
    if (avoidIds.length) url += `&avoid=${avoidIds.join(",")}`;

    const res = await fetch(url);
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

      // Determine if highlighting is needed for kill amount
      const kills = getKills(sysId);
      const killClass = (kills >= 5) ? "kills-high" : "";

      // Display output
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
        addAvoidTag(s.system);
        input.value = "";
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
        const systemName = items[currentFocus].textContent.replace(/\s\(.+\)/, "");
        addAvoidTag(systemName);
        input.value = "";
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

// --- Remember last chosen route flag ---
const flagRadios = document.querySelectorAll("input[name='route-flag']");

// Load saved value on page load
const savedFlag = localStorage.getItem("route-flag");
if (savedFlag) {
  const radio = document.querySelector(`input[name='route-flag'][value='${savedFlag}']`);
  if (radio) radio.checked = true;
}

// Save whenever user changes
flagRadios.forEach(radio => {
  radio.addEventListener("change", () => {
    localStorage.setItem("route-flag", radio.value);
  });
});

// Initialize first avoid input
createAvoidInput();

// --- Save + restore avoid list ---
function saveAvoidList() {
  const avoidNames = Array.from(avoidContainer.querySelectorAll(".avoid-tag"))
    .map(tag => tag.textContent.replace("×", "").trim());
  localStorage.setItem("avoid-list", JSON.stringify(avoidNames));
}

function restoreAvoidList() {
  const stored = JSON.parse(localStorage.getItem("avoid-list") || "[]");
  stored.forEach(name => addAvoidTag(name));
}

// Hook saving when avoid tags change
const observer = new MutationObserver(saveAvoidList);
observer.observe(avoidContainer, { childList: true, subtree: true });

// Restore on page load
restoreAvoidList();


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
