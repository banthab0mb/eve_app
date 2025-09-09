// route.js
const originInput = document.getElementById("originSystem");
const destInput = document.getElementById("destSystem");
const suggestionsOrigin = document.createElement("div");
const suggestionsDest = document.createElement("div");
const routeBtn = document.getElementById("routeBtn");
const routeOutput = document.getElementById("routeOutput");

// Wrap suggestions under each input
originInput.parentNode.appendChild(suggestionsOrigin);
destInput.parentNode.appendChild(suggestionsDest);
suggestionsOrigin.id = "suggestions-origin";
suggestionsDest.id = "suggestions-dest";

let systems = [];
let currentFocusOrigin = -1;
let currentFocusDest = -1;

// Load systems.json
fetch("systems.json")
  .then(res => res.json())
  .then(data => systems = data)
  .catch(err => console.error("Failed to load systems.json:", err));

// Generic autocomplete function
function setupAutocomplete(inputEl, suggestionsEl, focusVar) {
  inputEl.addEventListener("input", () => {
    const query = inputEl.value.trim().toLowerCase();
    if (!query) {
      suggestionsEl.innerHTML = "";
      return;
    }

    const matches = systems
      .filter(s => s.system.toLowerCase().startsWith(query))
      .slice(0, 10);

    suggestionsEl.innerHTML = "";

    matches.forEach(s => {
        const div = document.createElement("div");
        div.classList.add("suggestion");
        // System name + region in italics
        div.innerHTML = `${s.system} <span class="region">(${s.region})</span>`;

        div.addEventListener("click", () => {
            inputEl.value = s.system;
            suggestionsEl.innerHTML = "";
        });

        suggestionsEl.appendChild(div);
    });

  });

  inputEl.addEventListener("keydown", (e) => {
    const items = suggestionsEl.querySelectorAll(".suggestion");
    let currentFocus = inputEl === originInput ? currentFocusOrigin : currentFocusDest;

    if (e.key === "ArrowDown") {
      currentFocus++;
      if (currentFocus >= items.length) currentFocus = 0;
      setActive(items, currentFocus);
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      currentFocus--;
      if (currentFocus < 0) currentFocus = items.length - 1;
      setActive(items, currentFocus);
      e.preventDefault();
    } else if (e.key === "Enter") {
      if (currentFocus > -1 && items.length) {
        e.preventDefault();
        inputEl.value = items[currentFocus].textContent;
        suggestionsEl.innerHTML = "";
      }
    }

    if (inputEl === originInput) currentFocusOrigin = currentFocus;
    else currentFocusDest = currentFocus;
  });

  function setActive(items, index) {
    items.forEach(el => el.classList.remove("active"));
    if (index > -1 && items[index]) {
      items[index].classList.add("active");
    }
  }

  document.addEventListener("click", (e) => {
    if (e.target !== inputEl) suggestionsEl.innerHTML = "";
  });
}

// Initialize autocomplete for both inputs
setupAutocomplete(originInput, suggestionsOrigin);
setupAutocomplete(destInput, suggestionsDest);

// Route planning (dummy example using systems.json names and IDs)
routeBtn.addEventListener("click", () => {
  const originName = originInput.value.trim().toLowerCase();
  const destName = destInput.value.trim().toLowerCase();

  if (!originName || !destName) {
    routeOutput.innerHTML = "<p>Please enter both origin and destination.</p>";
    return;
  }

  const origin = systems.find(s => s.system.toLowerCase() === originName);
  const dest = systems.find(s => s.system.toLowerCase() === destName);

  if (!origin || !dest) {
    routeOutput.innerHTML = "<p>One or both systems not found.</p>";
    return;
  }

  // Display dummy route for now
  routeOutput.innerHTML = `
    <table>
      <tr><th>Step</th><th>System</th><th>Region</th></tr>
      <tr><td>1</td><td>${origin.system}</td><td>${origin.region}</td></tr>
      <tr><td>2</td><td>${dest.system}</td><td>${dest.region}</td></tr>
    </table>
  `;
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