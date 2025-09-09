// routes.js
const originInput = document.getElementById("originSystem");
const destInput = document.getElementById("destSystem");
const suggestionsDiv = document.getElementById("routeSuggestions");
const routeBtn = document.getElementById("routeBtn");
const routeOutput = document.getElementById("routeOutput");

let systemsData = [];
let currentFocus = -1;
let activeInput = null; // track which box is active 

// Load systems.json once
fetch("systems.json")
  .then((res) => res.json())
  .then((data) => (systemsData = data))
  .catch((err) => console.error("Failed to load systems.json:", err));

/**
 * Setup autocomplete for a given input box
 */
function setupAutocomplete(inputEl) {
  inputEl.addEventListener("input", () => {
    const val = inputEl.value.trim().toLowerCase();
    currentFocus = -1;
    activeInput = inputEl;

    if (!val) {
      suggestionsDiv.innerHTML = "";
      return;
    }

    const matches = systemsData
      .filter((sys) => sys.system.toLowerCase().startsWith(val))
      .slice(0, 10);

    suggestionsDiv.innerHTML = "";
    matches.forEach((sys) => {
      const div = document.createElement("div");
      div.classList.add("suggestion");
      div.textContent = sys.system;

      div.addEventListener("click", () => {
        inputEl.value = sys.system;
        suggestionsDiv.innerHTML = "";
      });

      suggestionsDiv.appendChild(div);
    });
  });

  inputEl.addEventListener("keydown", (e) => {
    let items = suggestionsDiv.querySelectorAll(".suggestion");

    if (e.key === "ArrowDown") {
      if (items.length) {
        currentFocus++;
        if (currentFocus >= items.length) currentFocus = 0;
        setActive(items);
        e.preventDefault();
      }
    } else if (e.key === "ArrowUp") {
      if (items.length) {
        currentFocus--;
        if (currentFocus < 0) currentFocus = items.length - 1;
        setActive(items);
        e.preventDefault();
      }
    } else if (e.key === "Enter") {
      if (currentFocus > -1 && items.length) {
        e.preventDefault();
        inputEl.value = items[currentFocus].textContent;
        suggestionsDiv.innerHTML = "";
      }
    }
  });
}

function setActive(items) {
  items.forEach((el) => el.classList.remove("active"));
  if (currentFocus > -1 && items[currentFocus]) {
    items[currentFocus].classList.add("active");
  }
}

/**
 * Lookup system_id by name
 */
function getSystemId(name) {
  const sys = systemsData.find(
    (s) => s.system.toLowerCase() === name.toLowerCase()
  );
  return sys ? sys.system_id : null;
}

/**
 * Lookup system name by id
 */
function getSystemName(id) {
  const sys = systemsData.find((s) => s.system_id === id);
  return sys ? sys.system : id;
}

/**
 * Fetch route from EVE API
 */
routeBtn.addEventListener("click", () => {
  const origin = originInput.value.trim();
  const dest = destInput.value.trim();

  if (!origin || !dest) {
    routeOutput.innerHTML = "<p>Please enter both systems.</p>";
    return;
  }

  const originId = getSystemId(origin);
  const destId = getSystemId(dest);

  if (!originId || !destId) {
    routeOutput.innerHTML = "<p>Invalid system name.</p>";
    return;
  }

  const url = `https://esi.evetech.net/latest/route/${originId}/${destId}/`;

  routeOutput.innerHTML = "<p>Loading route...</p>";

  fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error("Failed to fetch route");
      return res.json();
    })
    .then((ids) => {
      if (!ids.length) {
        routeOutput.innerHTML = "<p>No route found.</p>";
        return;
      }

      const names = ids.map(getSystemName);
      routeOutput.innerHTML = `
        <p><b>Route from ${origin} → ${dest}:</b></p>
        <ol>${names.map((n) => `<li>${n}</li>`).join("")}</ol>
      `;
    })
    .catch((err) => {
      console.error(err);
      routeOutput.innerHTML = "<p>Error fetching route.</p>";
    });
});

// Close suggestions when clicking outside
document.addEventListener("click", (e) => {
  if (e.target !== originInput && e.target !== destInput) {
    suggestionsDiv.innerHTML = "";
  }
});

// Attach autocomplete
setupAutocomplete(originInput);
setupAutocomplete(destInput);


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