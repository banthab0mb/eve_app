  // Assign elements to CSS and stuff
  const input = document.querySelector('#systemName') || document.querySelector('.search-box');
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
let names = [];

// Load jsons
fetch('alliances.json')
  .then(res => res.json())
  .then(data => {
    alliances = data;
    console.log('alliances.json loaded, alliances:', alliances.length);
  })
  .catch(err => {
    console.error('Failed to load alliances.json:', err);
  });
  fetch('corporations.json')
  .then(res => res.json())
  .then(data => {
    corps = data;
    console.log('corporations.json loaded, corporations:', corps.length);
  })
  .catch(err => {
    console.error('Failed to load corporations.json:', err);
  });

async function runLookup() {
  const name = input.value.trim().toLowerCase();

  // Escape logic
  if (!name) return;
  if (!names || !names.length) {
    outputDiv.innerHTML = '<p>Data still loading, try again in a moment.</p>';
    return;
  }

  const Name = names.find(s => s.names.toLowerCase() === name);
  if (!system) {
    outputDiv.innerHTML = `<p>"${escapeHtml(input.value)}" not found!</p>`;
    return;
  }

  const [result] = await fetch('https://esi.evetech.net/alliances/${id}');
  
  formatOutput(result);
  console.log(result);
}

// Format clean output
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

// Basically everything below is for input handling and keyboard navigation
  input.addEventListener('input', (e) => {
    const q = input.value.trim().toLowerCase();
    renderSuggestions(q);
  });

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
      // If a suggestion is highlighted, pick it and DON'T run lookup
      if (currentFocus > -1 && items.length) {
        e.preventDefault();
        const chosen = items[currentFocus];
        if (chosen) {
          // choose text only (strip the region in parentheses)
          const txt = chosen.textContent.replace(/\s\(.+\)$/, '').trim();
          input.value = txt;
          hideSuggestions();
          return;
        }
      }
      // otherwise run lookup
      e.preventDefault();
      runLookup();
    }
  });

 // Show/hide suggestions functions
function hideSuggestions() {
  suggestionsDiv.innerHTML = '';
  suggestionsDiv.style.display = 'none';
  currentFocus = -1;
}
function showSuggestionsContainer() {
  suggestionsDiv.style.display = 'block';
}

// Build and show suggestions
function renderSuggestions(query) {
  if (!suggestionsDiv || !input) return;
  suggestionsDiv.innerHTML = '';
  currentFocus = -1;

  if (!query) {
    hideSuggestions();
    return;
  }

  if (!systems || !systems.length) {
    // still loading systems.json or failed loading
    console.log('No systems loaded yet; suggestions unavailable');
    hideSuggestions();
    return;
  }

  // Find 12 systems from systems.json that start with what is being inputted
  const matches = systems
    .filter(s => s.system.toLowerCase().startsWith(query))
    .slice(0, 12);

  if (!matches.length) {
    hideSuggestions();
    return;
  }

  // ensure suggestions container gets the same width as the input
  // (works even if CSS not loaded correctly)
  const rect = input.getBoundingClientRect();
  suggestionsDiv.style.minWidth = `${rect.width}px`;

  matches.forEach((s, idx) => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.setAttribute('data-idx', idx);
    // innerHTML includes the italic region span (style provided by CSS)
    div.innerHTML = `${escapeHtml(s.system)} <span class="region">(${escapeHtml(s.region || 'Unknown')})</span>`;
    div.style.cursor = 'pointer';

    div.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      input.value = s.system;
      hideSuggestions();
      input.focus();
    });
    suggestionsDiv.appendChild(div);
  });

  showSuggestionsContainer();
}

function setActive(items) {
  items.forEach(i => i.classList.remove('active'));
  if (currentFocus > -1 && items[currentFocus]) items[currentFocus].classList.add('active');
  // ensure active item is visible (scroll into view if needed)
  const active = items[currentFocus];
  if (active) active.scrollIntoView({ block: 'nearest' });
}

// click outside to hide
document.addEventListener('click', (ev) => {
  if (!input) return;
  if (ev.target === input || suggestionsDiv.contains(ev.target)) return;
  hideSuggestions();
});

// make lookup button clickable with pointer if CSS doesn't set it
lookupBtn.style.cursor = lookupBtn.style.cursor || 'pointer';
lookupBtn.addEventListener('click', runLookup);

