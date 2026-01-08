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
  console.warn('lookup.js: missing one or more required elements:', { input, suggestionsDiv, lookupBtn, outputDiv });
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

// Load JSONs
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

  // Update URL without reloading
  const params = new URLSearchParams(window.location.search);
  params.set('q', name);
  history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);

  outputDiv.innerHTML = `<p>Searching for "${escapeHtml(name)}"...</p>`;

  // ------------------ LOCAL JSON LOOKUP ------------------
  const alliance = alliances.find(a =>
    a.name.toLowerCase() === name.toLowerCase() ||
    (a.ticker && a.ticker.toLowerCase() === name.toLowerCase())
  );

  if (alliance) {
    const allianceId = alliance.alliance_id || alliance.id || alliance.allianceID;
    if (!allianceId) {
      outputDiv.innerHTML = `<p>Alliance found in JSON, but ID missing.</p>`;
      return;
    }
    const details = await fetch(`https://esi.evetech.net/latest/alliances/${allianceId}/`).then(r => r.json());
    outputDiv.innerHTML = formatOutput({ category: "alliance", id: allianceId, details });
    outputDiv.style.display = "block";
    return;
  }

  const corp = corporations.find(c =>
    c.name.toLowerCase() === name.toLowerCase() ||
    (c.ticker && c.ticker.toLowerCase() === name.toLowerCase())
  );

  if (corp) {
    const corpId = corp.corporation_id || corp.id || corp.corporationID;
    if (!corpId) {
      outputDiv.innerHTML = `<p>Corporation found in JSON, but ID missing.</p>`;
      return;
    }
    const details = await fetch(`https://esi.evetech.net/latest/corporations/${corpId}/`).then(r => r.json());
    outputDiv.innerHTML = formatOutput({ category: "corporation", id: corpId, details });
    outputDiv.style.display = "block";
    return;
  }

  // ------------------ ESI UNIVERSE IDS FALLBACK ------------------
  try {
    const res = await fetch("https://esi.evetech.net/latest/universe/ids/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([name])
    });

    if (!res.ok) {
      const text = await res.text();
      outputDiv.innerHTML = `<p>universe/ids failed: ${res.status}</p><pre>${escapeHtml(text)}</pre>`;
      outputDiv.style.display = "block"; 
      return;
    }

    const data = await res.json();

    // -------- CHARACTER --------
    if (data.characters && data.characters.length) {
      const charId = data.characters[0].id;
      const char = await fetch(`https://esi.evetech.net/latest/characters/${charId}/`).then(r => r.json());
      const corp = await fetch(`https://esi.evetech.net/latest/corporations/${char.corporation_id}/`).then(r => r.json());

      let alliance = null;
      if (corp.alliance_id) {
        alliance = await fetch(`https://esi.evetech.net/latest/alliances/${corp.alliance_id}/`).then(r => r.json());
      }

      outputDiv.innerHTML = formatOutput({ category: "character", id: charId, details: char, corp, alliance });
      outputDiv.style.display = "block"; 
      return;
    }

    // -------- CORPORATION --------
    if (data.corporations && data.corporations.length) {
      const corpId = data.corporations[0].id;
      const corpDetails = await fetch(`https://esi.evetech.net/latest/corporations/${corpId}/`).then(r => r.json());
      outputDiv.innerHTML = formatOutput({ category: "corporation", id: corpId, details: corpDetails });
      outputDiv.style.display = "block"; 
      return;
    }

    // -------- ALLIANCE --------
    if (data.alliances && data.alliances.length) {
      const allianceId = data.alliances[0].id;
      const allianceDetails = await fetch(`https://esi.evetech.net/latest/alliances/${allianceId}/`).then(r => r.json());
      outputDiv.innerHTML = formatOutput({ category: "alliance", id: allianceId, details: allianceDetails });
      outputDiv.style.display = "block"; 
      return;
    }

    // -------- NO MATCH --------
    outputDiv.innerHTML = `<p>No match for "${escapeHtml(name)}"</p>`;
    outputDiv.style.display = "block";

  } catch (err) {
    console.error("Lookup failed:", err);
    outputDiv.innerHTML = `<p>Error during lookup. Check console.</p>`;
    outputDiv.style.display = "block"; 
  }
}

// Fetch alliance info
async function getAllianceInfo(id) {
  const response = await fetch(`https://esi.evetech.net/latest/alliances/${id}`);
  const alliance = await response.json();
  return alliance;
}

async function renderAllianceInfo(corp) {
  if (!corp.alliance_id) {
    document.querySelector("#alliance-name").innerHTML = `<p>None</p>`;
    return;
  }

  const alliance = await getAllianceInfo(corp.alliance_id);
  const name = alliance.name ?? "Unknown";
  const ticker = alliance.ticker ?? "";

  document.querySelector("#alliance-name").innerHTML = `<p>
        <links>
          <a href="https://banthab0mb.github.io/eve_app/lookup.html?q=${name}">
            ${name}
          </a>
        </links> [${ticker}]
  </p>`;
}

async function getAllianceCorps(id) {
  const response = await fetch(`https://esi.evetech.net/alliances/${id}/corporations`);
  const allianceCorps = await response.json();
  const corps = allianceCorps
  .map(id => corporations.find(c => c.id === id))
    .filter(Boolean);
  renderCorpTable(corps);
  console.log(corps);
}

function renderCorpTable(corps) {
  // create table element
  const table = document.createElement('table');
  table.style.borderCollapse = 'collapse';
  table.style.width = '100%';
  table.style.margin = 'auto';
  
  // add corp rows
  corps.forEach(corp => {
    const row = table.insertRow();
    
    const nameCell = row.insertCell();
    const link = document.createElement('a');
    link.href = `https://banthab0mb.github.io/eve_app/lookup.html?q=${encodeURIComponent(corp.name)}`;
    link.textContent = corp.name;
    nameCell.appendChild(link);
    nameCell.style.border = '1px solid #0d0d0d';
    nameCell.style.padding = '4px';
    
    const logoCell = row.insertCell();
    logoCell.style.border = '1px solid #0d0d0d';
    logoCell.style.padding = '4px';
    const img = document.createElement('img');
    img.src=`https://images.evetech.net/corporations/${corp.id}/logo`;
    img.alt = corp.name;
    img.width = 64;
    img.height = 64;
    logoCell.appendChild(img);
  });

  // append table to container
  const container = document.getElementById('corp-table-container');
  container.innerHTML = ''; // clear old table if any
  container.appendChild(table);
}

// ------------------ FORMAT OUTPUT ------------------
function formatOutput(result) {
  if (!result) return "No results found.";

  const formatDate = (iso) => iso ? iso.split("T")[0] : "N/A";
  const formatSec = (sec) => sec !== undefined ? sec.toFixed(1) : "N/A";

  if (result.category === "character") {
    const char = result.details;
    const corp = result.corp;
    const alliance = result.alliance;

    return `
<div class="lookup-result">
  <h2>${char.name}</h2>
  <img src="https://images.evetech.net/characters/${result.id}/portrait" alt="${char.name}" class="portrait" height="256px" width="256px">
  <p>Birthday: ${formatDate(char.birthday)}</p>
  <p>Sec Status: ${formatSec(char.security_status)}</p>

  <hr>
  <div class="char-affiliations">
  <div class="corp-info">
    <h3>Corporation</h3>
    <img src="https://images.evetech.net/corporations/${char.corporation_id}/logo" alt="${corp.name}" class="logo" height="128px" width="128px">
    <p>
        <links>
          <a href="https://banthab0mb.github.io/eve_app/lookup.html?q=${corp.name}">
            ${corp.name}
          </a>
        </links> [${corp.ticker}]
      </p>
  </div>
  <div class="alliance-info">
  <h3>Alliance</h3>
    ${alliance ? `
      <img src="https://images.evetech.net/alliances/${char.alliance_id}/logo" alt="${alliance.name}" class="logo" height="128px" width="128px">
      <p>
        <links>
          <a href="https://banthab0mb.github.io/eve_app/lookup.html?q=${alliance.name}">
            ${alliance.name}
          </a>
        </links> [${alliance.ticker}]
      </p>
    ` : "<p>None</p>"}
  </div>
  </div>
  <p><a href="https://zkillboard.com/character/${result.id}" target="_blank">zKillboard</a></p>
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
    renderAllianceInfo(corp);
    return `
<div class="lookup-result">
  <h2>${corp.name}</h2>
  <img src="https://images.evetech.net/corporations/${result.id}/logo" alt="${corp.name}" class="logo" height="256px" width="256px">
  <p>[${corp.ticker}]</p>
  <img src="https://images.evetech.net/alliances/${corp.alliance_id}/logo" alt="${corp.alliance}" class="logo" height="128px" width="128px">
  <div id="alliance-name"></div>
  <p><a href="${corp.url}" target="_blank">${corp.url}</a></p>
  <p><a href="https://zkillboard.com/corporation/${result.id}" target="_blank">zKillboard</a></p>
  <hr>
  <div class="corp-description">
    <h3>Description</h3>
    <p style="text-align: left;">${cleanDescription(corp.description)}</p>
  </div>
</div>
    `;
  }

  if (result.category === "alliance") {
    const alliance = result.details;
    getAllianceCorps(result.id); 
    return `
<div class="lookup-result">
  <h2>${alliance.name}</h2>
  <img src="https://images.evetech.net/alliances/${result.id}/logo" alt="${alliance.name}" class="logo" height="256px" width="256px">
  <p>[${alliance.ticker}]</p>
  <p>Date Founded: ${formatDate(alliance.date_founded)}</p>
  <p><a href="https://zkillboard.com/alliance/${result.id}" target="_blank">zKillboard</a></p>
  <p>Corportations:</p>
  <div id="corp-table-container"></div>
</div>
    `;
  }

  return JSON.stringify(result, null, 2);
}

const STATION_TYPE_IDS = new Set([
    14, 54, 56, 57, 58, 59, 1529, 1530, 1531, 1926, 1927, 1928, 1929, 1930, 1931,
    1932, 2071, 2496, 2497, 2498, 2499, 2500, 2501, 2502, 3864, 3865, 3866, 3867,
    3868, 3869, 3870, 3871, 3872, 4023, 4024, 9856, 9857, 9867, 9868, 9873, 10795,
    12242, 12294, 12295, 19757, 21642, 21644, 21645, 21646, 22296, 22297, 22298,
    29323, 29387, 29388, 29389, 29390, 34325, 34326, 52678, 59956, 71361, 74397,
]);

function cleanDescription(raw) {
    if (!raw) return "No description.";
    let cleaned = raw;

    // 1. Initial Character/Unicode Cleaning
    cleaned = cleaned.replace(/\\u([\dA-F]{4})/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
    cleaned = cleaned.replace(/\\'/g, "'");
    cleaned = cleaned.replace(/^u'/, "");

    // 2. Map showinfo: links to INTERNAL lookup (Name-based)
    cleaned = cleaned.replace(/<a href="showinfo:[^"]+">([^<]+)<\/a>/gi, (match, name) => {
        return `<a href="https://banthab0mb.github.io/eve_app/lookup.html?q=${encodeURIComponent(name.trim())}">${name}</a>`;
    });

    // 3. STRIP unsupported EVE protocols (Converts to plain text)
    const unsupportedProtocols = [
        'bookmarkfolder', 'showchannel', 'opportunity', 'localsvc', 
        'helpPointer', 'fitting', 'fleet', 'contract'
    ];
    
    unsupportedProtocols.forEach(protocol => {
        // This regex finds the whole <a> tag and replaces it with just the text inside ($1)
        const regex = new RegExp(`<a [^>]*href="${protocol}:[^"]+"[^>]*>(.*?)<\/a>`, 'gi');
        cleaned = cleaned.replace(regex, '$1');
    });

    // 4. Map specific IDs to external tools or INTERNAL lookup
    cleaned = cleaned
        .replace(/href="killReport:(\d+)/g, 'target=\'_blank\' href="https://zkillboard.com/kill/$1')
        .replace(/href="showinfo:4\/\//g, 'href="https://zkillboard.com/constellation/')
        .replace(/href="showinfo:3\/\//g, 'href="https://zkillboard.com/region/')
        .replace(/href="showinfo:5\/\//g, 'href="https://zkillboard.com/system/')
        .replace(/<a href="showinfo:2\/\/(\d+)">([^<]+)<\/a>/gi, '<a href="https://banthab0mb.github.io/eve_app/lookup.html?q=$2">$2</a>')
        .replace(/href="showinfo:16159\/\//g, 'href="https://evewho.com/alliance/')
        .replace(/href="showinfo:30\/\//g, 'href="https://evewho.com/faction/');

    // Handle Station IDs
    cleaned = cleaned.replace(/href="showinfo:(\d+)\/\//g, (match, id) => {
        if (typeof STATION_TYPE_IDS !== 'undefined' && STATION_TYPE_IDS.has(parseInt(id))) {
            return 'href="https://zkillboard.com/location/';
        }
        return match;
    });

    // Final catch-all: STRIP any remaining showinfo links (Converts to plain text)
    cleaned = cleaned.replace(/<a [^>]*href="showinfo:[^"]+"[^>]*>(.*?)<\/a>/gi, '$1');

    // 5. UI Cleanup (Loc tags, Br tags, Font scaling)
    cleaned = cleaned.replace(/<br\s*\/?>/gi, "\n");
    cleaned = cleaned.replace(/<loc>(.*?)<\/loc>/gi, "$1");
    cleaned = cleaned.replace(/<font([^>]*)size="(\d+)"([^>]*)>/gi, (_, pre, size, post) => {
        const scaled = Math.min(Math.max(parseInt(size), 10), 18);
        const rem = (scaled - 8) * 0.05 + 1;
        return `<font${pre} style="font-size:${rem}rem"${post}>`;
    });

    // 6. Sanitization
    const allowedTags = ["b", "i", "u", "strong", "em", "a", "font", "span"];
    cleaned = cleaned.replace(/<\/?([a-z]+)([^>]*)>/gi, (match, tag) => {
        const lowerTag = tag.toLowerCase();
        return allowedTags.includes(lowerTag) ? match : "";
    });

    // 7. Paragraphing
    return cleaned
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => `<p>${line}</p>`)
        .join("");
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

// ------------------ URL INIT ------------------
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const query = params.get('q');
  if (query && input) {
    input.value = query;
    runLookup();
  }
});