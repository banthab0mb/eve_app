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
function setupAutocomplete(inputEl, suggestionsEl) {
  let currentFocus = -1;

  inputEl.addEventListener("input", () => {
    const query = inputEl.value.trim().toLowerCase();
    currentFocus = -1;
    suggestionsEl.innerHTML = "";
    if (!query) return;

    const matches = systems.filter(s => s.system.toLowerCase().startsWith(query)).slice(0, 10);

    matches.forEach(s => {
      const div = document.createElement("div");
      div.classList.add("suggestion");
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
    if (!items.length) return;

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
      if (currentFocus > -1) {
        e.preventDefault();
        inputEl.value = items[currentFocus].textContent.split(" (")[0]; // remove region from value
        suggestionsEl.innerHTML = "";
      }
    }
  });
}

function setActive(items, index) {
  items.forEach(el => el.classList.remove("active"));
  if (index > -1 && items[index]) items[index].classList.add("active");
}

// Initialize for system lookup
setupAutocomplete(document.getElementById("systemName"), document.getElementById("suggestions-system"));

// Initialize for route planner
setupAutocomplete(document.getElementById("originSystem"), document.getElementById("suggestions-origin"));
setupAutocomplete(document.getElementById("destSystem"), document.getElementById("suggestions-dest"));

document.getElementById("routeBtn").addEventListener("click", () => {
  const originName = document.getElementById("origin").value.trim().toLowerCase();
  const destName = document.getElementById("dest").value.trim().toLowerCase();

  const origin = systems.find(s => s.system.toLowerCase() === originName);
  const dest = systems.find(s => s.system.toLowerCase() === destName);

  if (!origin || !dest) {
    document.getElementById("route-output").innerHTML = `<p>Invalid origin or destination system.</p>`;
    return;
  }

  document.getElementById("route-output").innerHTML = `
    <table>
      <tr><th>Step</th><th>System</th></tr>
      <tr><td>1</td><td>${origin.system} <i>(${origin.region})</i></td></tr>
      <tr><td>2</td><td>${dest.system} <i>(${dest.region})</i></td></tr>
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