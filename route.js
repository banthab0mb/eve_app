const originInput = document.getElementById("originSystem");
const destInput = document.getElementById("destSystem");
const routeBtn = document.getElementById("routeBtn");
const routeOutput = document.getElementById("route-output");
const totalJumps = document.getElementById("total-jumps");
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
}

// Create new avoid input
function createAvoidInput(value = "") {
  const group = document.createElement("div");
  group.classList.add("search-group");

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Avoid system";
  input.value = value;

  const suggestionsDiv = document.createElement("div");
  suggestionsDiv.classList.add("suggestions");

  group.appendChild(input);
  group.appendChild(suggestionsDiv);
  avoidContainer.appendChild(group);

  setupAutocomplete(input, suggestionsDiv.id = "avoid-suggestions-" + Date.now(), true);

  // On Enter, add system as avoid tag
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

  // Add next input dynamically when typing in last box
  input.addEventListener("input", () => {
    const lastInput = avoidContainer.querySelector("input:last-child");
    if (input === lastInput && input.value.trim() !== "") {
      createAvoidInput();
    }
  });

  // Remove empty inputs on blur if more than one
  input.addEventListener("blur", () => {
    if (input.value.trim() === "" && avoidContainer.querySelectorAll(".search-group").length > 1) {
      group.remove();
    }
  });
}

// Autocomplete setup
function setupAutocomplete(input, suggestionsId, isAvoid = false) {
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
        if (isAvoid) {
          addAvoidTag(s.system);
          input.value = "";
        } else {
          input.value = s.system;
        }
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
        const systemName = items[currentFocus].textContent.replace(/\s\(.+\)/, "");
        if (isAvoid) addAvoidTag(systemName);
        else input.value = systemName;
        input.value = isAvoid ? "" : input.value;
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
const savedFlag = localStorage.getItem("route-flag");
if (savedFlag) {
  const radio = document.querySelector(`input[name='route-flag'][value='${savedFlag}']`);
  if (radio) radio.checked = true;
}
flagRadios.forEach(radio => {
  radio.addEventListener("change", () => {
    localStorage.setItem("route-flag", radio.value);
  });
});

// Initialize first avoid input and restore saved avoids
function restoreAvoidList() {
  const stored = JSON.parse(localStorage.getItem("avoid-list") || "[]");
  if (stored.length) stored.forEach(name => addAvoidTag(name));
  createAvoidInput();
}
restoreAvoidList();

// Save avoid list whenever tags change
const observer = new MutationObserver(() => {
  const avoids = Array.from(avoidContainer.querySelectorAll(".avoid-tag"))
    .map(tag => tag.textContent.replace("×", "").trim())
    .filter(v => v !== "");
  localStorage.setItem("avoid-list", JSON.stringify(avoids));
});
observer.observe(avoidContainer, { childList: true, subtree: true });

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

  const flag = document.querySelector("input[name='route-flag']:checked").value;
  routeOutput.innerHTML = "<p>Fetching route...</p>";

  try {
    let url = `https://esi.evetech.net/latest/route/${originId}/${destId}?flag=${flag}`;
    if (avoidIds.length) url += `&avoid=${avoidIds.join(",")}`;

    const res = await fetch(url);
    const routeData = await res.json();

    if (!routeData || !routeData.length) {
      routeOutput.innerHTML = "<p>No route found.</p>";
      return;
    }

    let html = `<table>
      <tr><th>Jumps</th><th>System (Region)</th><th>Security</th><th>Kills (last hour)</th><th>zKillboard</th></tr><tr>`;

    for (let i = 0; i < routeData.length; i++) {
      const sysId = routeData[i];
      const system = systems.find(s => s.system_id === sysId);
      if (!system) continue;

      const sec = parseFloat(system.security_status.toFixed(1)).toFixed(1);
      const cls = secClass(sec);
      const kills = getKills(sysId);
      const killClass = (kills >= 5) ? "kills-high" : "";

      html += `<tr>
        <td><b>${i + 1}</b></td>
        <td>${system.system} <span class="region">(${system.region})</span></td>
        <td class="${cls}"><b>${sec}</b></td>
        <td><span class="${killClass}"><b>${kills}</b></span></td>
        <td><links><a href="https://zkillboard.com/system/${sysId}/" target="_blank">zKillboard</a></links></td>
      </tr>`;
    }

    totalJumps.innerHTML = `Total Jumps: ${routeData.length}`;
    html += "</table>";
    routeOutput.innerHTML = html;
  } catch (err) {
    console.error(err);
    routeOutput.innerHTML = "<p>Error fetching route.</p>";
  }
});