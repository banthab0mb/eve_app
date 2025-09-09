// script.js
const input = document.getElementById("systemName");
const suggestionsDiv = document.getElementById("suggestions");
const lookupBtn = document.getElementById("lookupBtn");
const outputDiv = document.getElementById("output");

let systems = [];
let currentFocus = -1; // track highlighted suggestion

// Load systems.json once
fetch("systems.json")
  .then(res => res.json())
  .then(data => systems = data)
  .catch(err => console.error("Failed to load systems.json:", err));

// Simple autocomplete
input.addEventListener("input", () => {
  const query = input.value.trim().toLowerCase();
  currentFocus = -1; // reset focus
  if (!query) {
    suggestionsDiv.innerHTML = "";
    return;
  }

  const matches = systems
    .filter(s => s.system.toLowerCase().includes(query))
    .slice(0, 10); // limit suggestions

  suggestionsDiv.innerHTML = "";

  matches.forEach(s => {
    const div = document.createElement("div");
    div.classList.add("suggestion");
    div.textContent = s.system;

    // Click → fill input + lookup
    div.addEventListener("click", () => {
      input.value = s.system;
      suggestionsDiv.innerHTML = "";
      lookupBtn.click();
    });

    // Mousedown (used by Enter key) → fill input only, no lookup
    div.addEventListener("mousedown", (e) => {
      e.preventDefault(); // keep focus in input
      input.value = s.system;
      suggestionsDiv.innerHTML = "";
    });

    suggestionsDiv.appendChild(div);
  });
});

// Keyboard navigation
input.addEventListener("keydown", (e) => {
  let items = suggestionsDiv.querySelectorAll(".suggestion");
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
    if (currentFocus > -1) {
      e.preventDefault(); // stop lookup
      items[currentFocus].dispatchEvent(new Event("mousedown"));
    } else {
      lookupBtn.click(); // only if no suggestion highlighted
    }
  } else if (e.key === "Tab") {
    if (items.length > 0) {
      e.preventDefault();
      items[0].click(); // pick the first suggestion
    }
  }
});

function setActive(items) {
  items.forEach(el => el.classList.remove("active"));
  if (currentFocus > -1 && items[currentFocus]) {
    items[currentFocus].classList.add("active");
  }
}

// Lookup system on button click
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
    <p><b>Security Status:</b> ${system.security_status}</p>
  `;
});

// Close suggestions when clicking outside
document.addEventListener("click", (e) => {
  if (e.target !== input) {
    suggestionsDiv.innerHTML = "";
  }
});
