// routes.js
let systemsData = [];

// Load systems.json once
async function loadSystems() {
  if (systemsData.length) return;
  try {
    const res = await fetch("systems.json"); // adjust path if in docs/
    systemsData = await res.json();
  } catch (err) {
    console.error("Failed to load systems.json", err);
  }
}

// Lookup by name -> ID
function getSystemIdByName(name) {
  const match = systemsData.find(
    (sys) => sys.name.toLowerCase() === name.toLowerCase()
  );
  return match ? match.id : null;
}

// Lookup by ID -> name
function getSystemNameById(id) {
  const match = systemsData.find((sys) => sys.id === id);
  return match ? match.name : id;
}

// Fetch and display route
async function getRoute(startName, endName) {
  const output = document.getElementById("output");
  output.innerHTML = "<p>Loading route...</p>";

  await loadSystems();

  const startId = getSystemIdByName(startName);
  const endId = getSystemIdByName(endName);

  if (!startId || !endId) {
    output.innerHTML = `<p>Could not find one or both systems.</p>`;
    return;
  }

  try {
    // Fetch route from ESI
    const res = await fetch(
      `https://esi.evetech.net/latest/route/${startId}/${endId}/?datasource=tranquility`
    );
    const routeIds = await res.json();

    if (!Array.isArray(routeIds)) {
      output.innerHTML = `<p>No route found.</p>`;
      return;
    }

    // Map IDs -> names locally
    const routeNames = routeIds.map(getSystemNameById);

    output.innerHTML = "<h3>Route:</h3>";
    const list = document.createElement("ol");

    routeNames.forEach((name) => {
      const li = document.createElement("li");
      li.textContent = name;
      list.appendChild(li);
    });

    output.appendChild(list);
  } catch (err) {
    console.error(err);
    output.innerHTML = "<p>Error fetching route. Try again later.</p>";
  }
}

// Hook up UI
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("routeBtn");
  const startInput = document.getElementById("origin");
  const endInput = document.getElementById("destination");

  if (btn && startInput && endInput) {
    btn.addEventListener("click", () => {
      const start = startInput.value.trim();
      const end = endInput.value.trim();
      if (start && end) getRoute(start, end);
    });
  }
});


// Player count (EVE Online status API)
fetch("https://esi.evetech.net/latest/status/")
  .then(res => res.json())
  .then(data => {
    const playerCount = document.getElementById("onlineCounter");
    if (playerCount) playerCount.textContent = `Players Online: ${data.players.toLocaleString()}`;
  })
  .catch(() => {
    const playerCount = document.getElementById("onlineCounter");
    if (playerCount) playerCount.textContent = "Players Online: N/A";
  });