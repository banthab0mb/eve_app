// systemLookup.js
const input = document.getElementById("systemName");
const suggestionsDiv = document.getElementById("suggestions");
const lookupBtn = document.getElementById("lookupBtn");
const outputDiv = document.getElementById("output");

let systems = [];

// Load systems.json once
fetch("systems.json")
  .then(res => res.json())
  .then(data => systems = data)
  .catch(err => console.error("Failed to load systems.json:", err));

// Helper: get security class for color
function secClass(sec) {
  if (sec >= 0.5) return "sec-high";
  if (sec > 0.0) return "sec-low";
  return "sec-null";
}

// Autocomplete
let currentFocus = -1;
input.addEventListener("input", () => {
  const query = input.value.trim().toLowerCase();
  currentFocus = -1;
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
    } else {
      lookupBtn.click();
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

// Lookup system on button click
lookupBtn.addEventListener("click", async () => {
  const name = input.value.trim().toLowerCase();
  if (!name) return;

  const system = systems.find(s => s.system.toLowerCase() === name);
  if (!system) {
    outputDiv.innerHTML = `<p>System not found!</p>`;
    return;
  }

  outputDiv.innerHTML = `<p>Fetching kills and jumps...</p>`;

  try {
    // Fetch kills & jumps arrays
    const [killsRes, jumpsRes] = await Promise.all([
      fetch("https://esi.evetech.net/latest/universe/system_kills/?datasource=tranquility"),
      fetch("https://esi.evetech.net/latest/universe/system_jumps/?datasource=tranquility")
    ]);

    const killsData = await killsRes.json();
    const jumpsData = await jumpsRes.json();

    const systemKills = killsData.find(k => k.system_id === system.system_id)?.ship_kills || 0;
    const systemJumps = jumpsData.find(j => j.system_id === system.system_id)?.ship_jumps || 0;

    const secClassName = secClass(system.security_status);

    outputDiv.innerHTML = `
      <p><b>Name:</b> ${system.system}</p>
      <p><b>Constellation:</b> ${system.constellation || "Unknown"}</p>
      <p><b>Region:</b> ${system.region || "Unknown"}</p>
      <p><b>Security Status:</b> <span class="${secClassName}">${system.security_status.toFixed(2)}</span></p>
      <p><b>Kills (last hour):</b> ${systemKills}</p>
      <p><b>Jumps (last hour):</b> ${systemJumps}</p>
    `;
  } catch (err) {
    console.error(err);
    outputDiv.innerHTML = "<p>Error fetching kills/jumps.</p>";
  }
});
