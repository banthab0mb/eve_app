// Assign elements
const input = document.querySelector('#input') || document.querySelector('.search-box');
const suggestionsDiv =
  (input && input.parentElement && input.parentElement.querySelector('.suggestions')) ||
  document.getElementById('suggestions') ||
  document.getElementById('suggestions-box') ||
  document.querySelector('.suggestions');
const lookupBtn =
  document.getElementById('lookupBtn') ||
  document.querySelector('.search-button') ||
  document.querySelector('button.search-button') ||
  document.querySelector('button');
const outputDiv = document.getElementById('output') || document.querySelector('.output');

if (!input || !suggestionsDiv || !lookupBtn || !outputDiv) {
  console.warn('playerLookup.js: missing one or more required elements:', { input, suggestionsDiv, lookupBtn, outputDiv });
}

let currentFocus = -1;

// Escape HTML helper
function escapeHtml(text) {
  const div = document.createElement('div');
  div.innerText = text;
  return div.innerHTML;
}

// ------------------ LOOKUP ------------------
let alliances = [];
let corporations = [];

// Load jsons
fetch('alliances.json')
  .then(res => res.json())
  .then(data => {
    alliances = data;
    console.log('alliances.json loaded:', alliances.length);
  })
  .catch(err => console.error('Failed to load alliances.json:', err));

fetch('corporations.json')
  .then(res => res.json())
  .then(data => {
    corporations = data;
    console.log('corporations.json loaded:', corporations.length);
  })
  .catch(err => console.error('Failed to load corporations.json:', err));

async function runLookup() {
  const name = input.value.trim();
  if (!name) return;

  outputDiv.innerHTML = `<p>Searching for "${escapeHtml(name)}"...</p>`;

  // 1. Try to match locally in alliances
  const alliance = alliances.find(a => a.name.toLowerCase() === name.toLowerCase());
  if (alliance) {
    const allianceId = alliance.alliance_id || alliance.id || alliance.allianceID;
    if (!allianceId) {
      outputDiv.innerHTML = `<p>Alliance found in JSON, but ID missing.</p>`;
      return;
    }
    const details = await (await fetch(`https://esi.evetech.net/latest/alliances/${allianceId}/`)).json();
    outputDiv.innerHTML = formatOutput({ category: "alliance", id: allianceId, details });
    outputDiv.style.display = "block"; 
    return;
  }

  // 2. Try to match locally in corporations
  const corp = corporations.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (corp) {
    const corpId = corp.corporation_id || corp.id || corp.corporationID;
    if (!corpId) {
      outputDiv.innerHTML = `<p>Corporation found in JSON, but ID missing.</p>`;
      return;
    }
    const details = await (await fetch(`https://esi.evetech.net/latest/corporations/${corpId}/`)).json();
    outputDiv.innerHTML = formatOutput({ category: "corporation", id: corpId, details });
    outputDiv.style.display = "block"; 
    return;
  }

  // 3. Fallback → use universe/ids for characters
  try {
    console.log("POSTing to universe/ids with:", [name]);

    const res = await fetch("https://esi.evetech.net/latest/universe/ids/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([name]) // must be array of strings
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("universe/ids failed:", res.status, text);
      outputDiv.innerHTML = `<p>universe/ids failed: ${res.status}</p><pre>${escapeHtml(text)}</pre>`;
      outputDiv.style.display = "block"; 
      return;
    }

    const data = await res.json();
    console.log("universe/ids response:", data);

    if (data.characters && data.characters.length) {
      const id = data.characters[0].id;
      const char = await (await fetch(`https://esi.evetech.net/latest/characters/${id}/`)).json();
      const corp = await (await fetch(`https://esi.evetech.net/latest/corporations/${char.corporation_id}/`)).json();

      let alliance = null;
      if (corp.alliance_id) {
        alliance = await (await fetch(`https://esi.evetech.net/latest/alliances/${corp.alliance_id}/`)).json();
      }

      outputDiv.innerHTML = formatOutput({ category: "character", id, details: char, corp, alliance });
      outputDiv.style.display = "block"; 
      return;
    }

    outputDiv.innerHTML = `<p>No match for "${escapeHtml(name)}"</p>`;
    outputDiv.style.display = "block"; 
  } catch (err) {
    console.error("Lookup failed:", err);
    outputDiv.innerHTML = `<p>Error during lookup. Check console.</p>`;
    outputDiv.style.display = "block"; 
  }
  outputDiv.style.display = "block"; 
}

async function getAllianceName(id) {
  const alliance = await (await fetch(`https://esi.evetech.net/alliances/${id}`)).json();
  
  console.log(alliance.name);
  return alliance.name.tostring();
}

// ------------------ FORMAT OUTPUT ------------------
function formatOutput(result) {
  if (!result) return "No results found.";

  // Helper to format date as YYYY-MM-DD
  const formatDate = (iso) => iso ? iso.split("T")[0] : "N/A";

  // Helper to format sec status to 2 decimals
  const formatSec = (sec) => sec !== undefined ? sec.toFixed(1) : "N/A";

  if (result.category === "character") {
    const char = result.details;
    const corp = result.corp;
    const alliance = result.alliance;
    
    console.log(result, result.details, result.corp, result.alliance)
    console.log(char);
    console.log(corp);
    console.log(alliance);  

    return `
<div class="lookup-result">
  <h2>Character</h2>
  <img src="https://images.evetech.net/characters/${result.id}/portrait?size=256" alt="${char.name}" class="portrait">
  <p><strong>${char.name}</strong></p>
  <p>Birthday: ${formatDate(char.birthday)}</p>
  <p>Sec Status: ${formatSec(char.security_status)}</p>

  <hr>
  <h3>Corporation</h3>
  <img src="https://images.evetech.net/corporations/${char.corporation_id}/logo?size=128" alt="${corp.name}" class="logo">
  <p>${corp.name} [${corp.ticker}]</p>

  <h3>Alliance</h3>
  ${alliance ? `
    <img src="https://images.evetech.net/alliances/${char.alliance_id}/logo?size=128" alt="${alliance.name}" class="logo">
    <p>${alliance.name} [${alliance.ticker}]</p>
  ` : "<p>None</p>"}

  <hr>
  <div class="char-description">
    <h3>Description</h3>
    <p style="text-align: left;">${cleanDescription(char.description)}</p>
  </div>
</div>
    `;
  }

  if (result.category === "corporation") {
    const corp = result.details;

    console.log(result, result.details, result.corp, result.alliance)
    console.log(corp);
    console.log(getAllianceName(corp.alliance_id));
    return `
<div class="lookup-result">
  <h2>Corporation</h2>
  <img src="https://images.evetech.net/corporations/${result.id}/logo?size=256" alt="${corp.name}" class="logo">
  <p><strong>${corp.name}</strong> [${corp.ticker}]</p>
  <img src="https://images.evetech.net/alliances/${corp.alliance_id}/logo?size=128" alt="${corp.alliance}" class="logo">
  <p>${getAllianceName(corp.alliance_id) ?? "None"}</p>
  <p><a href="${corp.url}" target="_blank">${corp.url}</a></p>
  <div class="corp-description">
    <h3>Description</h3>
    <p style="text-align: left;">${cleanDescription(corp.description)}</p>
  </div>
</div>
    `;
  }

  if (result.category === "alliance") {
    const alliance = result.details;
    return `
<div class="lookup-result">
  <h2>Alliance</h2>
  <img src="https://images.evetech.net/alliances/${result.id}/logo?size=256" alt="${alliance.name}" class="logo">
  <p><strong>${alliance.name}</strong> [${alliance.ticker}]</p>
  <p>Date Founded: ${formatDate(alliance.date_founded)}</p>
</div>
    `;
  }

  return JSON.stringify(result, null, 2);
}

// Clean corporation description HTML
function cleanDescription(raw) {
  if (!raw) return "No description.";

  // Remove all <font ...> and </font>
  let cleaned = raw.replace(/<\/?font[^>]*>/g, "");

  // Replace <br> with line breaks
  cleaned = cleaned.replace(/<br\s*\/?>/gi, "\n");

  // Replace <loc><a href="...">text</a></loc> or <a href="...">text</a> with proper clickable links
  cleaned = cleaned.replace(/<loc><a href="([^"]+)">([^<]+)<\/a><\/loc>/gi, `<a href="$1" target="_blank">$2</a>`);
  cleaned = cleaned.replace(/<a href="([^"]+)">([^<]+)<\/a>/gi, `<a href="$1" target="_blank">$2</a>`);

  // Remove extra empty spaces
  cleaned = cleaned.replace(/\s+\n/g, "\n").trim();

  // Wrap in <p> with line breaks
  return cleaned.split("\n").map(line => `<p>${line}</p>`).join("");
}

// ------------------ INPUT + SUGGESTIONS ------------------
input.addEventListener('keydown', (e) => {
  const items = suggestionsDiv.querySelectorAll('.suggestion');
  if (e.key === 'ArrowDown') {
    if (!items.length) return;
    currentFocus = (currentFocus + 1) % items.length;
    setActive(items);
    e.preventDefault();
  } else if (e.key === 'ArrowUp') {
    if (!items.length) return;
    currentFocus = (currentFocus - 1 + items.length) % items.length;
    setActive(items);
    e.preventDefault();
  } else if (e.key === 'Escape') {
    hideSuggestions();
  } else if (e.key === 'Enter') {
    if (currentFocus > -1 && items.length) {
      e.preventDefault();
      const chosen = items[currentFocus];
      if (chosen) {
        const txt = chosen.textContent.replace(/\s\(.+\)$/, '').trim();
        input.value = txt;
        hideSuggestions();
        return;
      }
    }
    e.preventDefault();
    runLookup();
  }
});

function hideSuggestions() {
  suggestionsDiv.innerHTML = '';
  suggestionsDiv.style.display = 'none';
  currentFocus = -1;
}
function setActive(items) {
  items.forEach(i => i.classList.remove('active'));
  if (currentFocus > -1 && items[currentFocus]) items[currentFocus].classList.add('active');
  const active = items[currentFocus];
  if (active) active.scrollIntoView({ block: 'nearest' });
}

document.addEventListener('click', (ev) => {
  if (!input) return;
  if (ev.target === input || suggestionsDiv.contains(ev.target)) return;
  hideSuggestions();
});

// Button trigger
lookupBtn.style.cursor = lookupBtn.style.cursor || 'pointer';
lookupBtn.addEventListener('click', runLookup);