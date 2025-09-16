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
  outputDiv.innerHTML = `<pre>${formatOutput({ category: "alliance", id: allianceId, details })}</pre>`;
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
  outputDiv.innerHTML = `<pre>${formatOutput({ category: "corporation", id: corpId, details })}</pre>`;
  return;
}

  // 3. Fallback → use universe/ids for characters (or if it was missed)
  try {
    const res = await fetch("https://esi.evetech.net/latest/universe/ids/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names: [name] })
    });
    const data = await res.json();

    if (data.characters && data.characters.length) {
      const id = data.characters[0].id;
      const char = await (await fetch(`https://esi.evetech.net/latest/characters/${id}/`)).json();
      const corp = await (await fetch(`https://esi.evetech.net/latest/corporations/${char.corporation_id}/`)).json();
      let alliance = null;
      if (corp.alliance_id) {
        alliance = await (await fetch(`https://esi.evetech.net/latest/alliances/${corp.alliance_id}/`)).json();
      }
      outputDiv.innerHTML = `<pre>${formatOutput({ category: "character", id, details: char, corp, alliance })}</pre>`;
      return;
    }

    outputDiv.innerHTML = `<p>No match for "${escapeHtml(name)}"</p>`;
  } catch (err) {
    console.error("Lookup failed:", err);
    outputDiv.innerHTML = `<p>Error during lookup. Check console.</p>`;
  }
}

// ------------------ FORMAT OUTPUT ------------------
function formatOutput(result) {
  if (!result) return "No results found.";

  if (result.category === "character") {
    const char = result.details;
    const corp = result.corp;
    const alliance = result.alliance;

    return `
Character: ${char.name} (ID: ${result.id})
Birthday: ${char.birthday}
Sec Status: ${char.security_status ?? "N/A"}

Corporation: ${corp.name} [${corp.ticker}] (ID: ${corp.corporation_id})
Alliance: ${alliance ? `${alliance.name} [${alliance.ticker}] (ID: ${alliance.alliance_id})` : "None"}
    `.trim();
  }

  if (result.category === "corporation") {
    const corp = result.details;
    return `
Corporation: ${corp.name} [${corp.ticker}] (ID: ${result.id})
Alliance ID: ${corp.alliance_id ?? "None"}
    `.trim();
  }

  if (result.category === "alliance") {
    const alliance = result.details;
    return `
Alliance: ${alliance.name} [${alliance.ticker}] (ID: ${result.id})
Date Founded: ${alliance.date_founded}
    `.trim();
  }

  return JSON.stringify(result, null, 2);
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
