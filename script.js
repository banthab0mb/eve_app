// script.js
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

// Simple autocomplete
input.addEventListener("input", () => {
  const query = input.value.trim().toLowerCase();
  if (!query) {
    suggestionsDiv.innerHTML = "";
    return;
  }

  const matches = systems
    .filter(s => s.system.toLowerCase().includes(query))
    .slice(0, 10); // limit suggestions

  suggestionsDiv.innerHTML = matches
    .map(s => `<div class="suggestion">${s.system}</div>`)
    .join("");

  // click on suggestion to fill input
  document.querySelectorAll(".suggestion").forEach(el => {
    el.addEventListener("click", () => {
      input.value = el.textContent;
      suggestionsDiv.innerHTML = "";
    });
  });
});

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
    <p><b>Security Status:</b> ${system.security_status.toFixed(1)}</p>
  `;
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    lookupBtn.click();
  }
});

input.addEventListener("blur", () => {
  setTimeout(() => suggestionsDiv.innerHTML = "", 100);
});

