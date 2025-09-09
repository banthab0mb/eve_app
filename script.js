const input = document.getElementById("systemName");
const suggestionsDiv = document.getElementById("suggestions");
const lookupBtn = document.getElementById("lookupBtn");
const outputDiv = document.getElementById("output");

let systems = [];
let currentFocus = -1;

// Load systems.json once
fetch("systems.json")
  .then(res => res.json())
  .then(data => systems = data)
  .catch(err => console.error("Failed to load systems.json:", err));

// Autocomplete
input.addEventListener("input", () => {
  const query = input.value.trim().toLowerCase();
  currentFocus = -1;
  if (!query) {
    suggestionsDiv.innerHTML = "";
    return;
  }

  const matches = systems
    .filter(s => s.system.toLowerCase().startsWith(query))
    .slice(0, 10);

  suggestionsDiv.innerHTML = "";

  matches.forEach(s => {
    const div = document.createElement("div");
    div.classList.add("suggestion");
    div.textContent = s.system;

    div.addEventListener("click", () => {
      input.value = s.system;
      suggestionsDiv.innerHTML = "";
    });

    suggestionsDiv.appendChild(div);
  });
});

// Keyboard navigation
input.addEventListener("keydown", (e) => {
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
      input.value = items[currentFocus].textContent;
      suggestionsDiv.innerHTML = "";
    } else {
      e.preventDefault();
      lookupBtn.click();
    }
  }
});

function setActive(items) {
  items.forEach(el => el.classList.remove("active"));
  if (currentFocus > -1 && items[currentFocus]) {
    items[currentFocus].classList.add("active");
  }
}

// Lookup system
lookupBtn.addEventListener("click", () => {
  const name = input.value.trim().toLowerCase();
  if (!name) return;

  const system = systems.find(s => s.system.toLowerCase() === name);

  if (!system) {
    outputDiv.innerHTML = `<p>System not found!</p>`;
    return;
  }

  outputDiv.innerHTML = `
    <p><b>Name:</b> ${system.system}</p>
    <p><b>Constellation:</b> ${system.constellation || "Unknown"}</p>
    <p><b>Region:</b> ${system.region || "Unknown"}</p>
    <p><b>Security Status:</b> ${system.security_status.toFixed(1)}</p>
  `;
});

// Close suggestions when clicking outside
document.addEventListener("click", (e) => {
  if (e.target !== input) {
    suggestionsDiv.innerHTML = "";
  }
});

// Toggle CCP disclaimer
document.addEventListener("DOMContentLoaded", () => {
  const ccpLink = document.getElementById("ccp-link");
  const disclaimer = document.getElementById("ccp-disclaimer");

  if (ccpLink) {
    ccpLink.addEventListener("click", (e) => {
      e.preventDefault();
      disclaimer.style.display = disclaimer.style.display === "none" ? "block" : "none";
    });
  }
});

// Player count (EVE Online status API)
fetch("https://esi.evetech.net/latest/status/")
  .then(res => res.json())
  .then(data => {
    const playerCount = document.getElementById("onlineCounter");
    if (playerCount) playerCount.textContent = `TQ ${data.players.toLocaleString()}`;
  })
  .catch(() => {
    const playerCount = document.getElementById("onlineCounter");
    if (playerCount) playerCount.textContent = "Tranquility unreachable";
    playerCount.style.color = "#ff0000";
  });