(() => {
  // element selection
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
    console.warn('systemSearch.js: missing one or more required elements:', { input, suggestionsDiv, lookupBtn, outputDiv });
  }

  let systems = [];
  let currentFocus = -1;

  // Load systems.json
  fetch('systems.json')
    .then(res => res.json())
    .then(data => {
      systems = data;
      console.log('systems.json loaded, systems:', systems.length);
    })
    .catch(err => {
      console.error('Failed to load systems.json:', err);
    });

  // expose a global for any inline oninput="showSuggestions(...)" left in HTML
  window.showSuggestions = (value) => {
    // set input value and call the normal input handler
    if (!input) return;
    input.value = value;
    renderSuggestions(value.trim().toLowerCase());
  };

  // helper: show/hide
  function hideSuggestions() {
    suggestionsDiv.innerHTML = '';
    suggestionsDiv.style.display = 'none';
    currentFocus = -1;
  }
  function showSuggestionsContainer() {
    suggestionsDiv.style.display = 'block';
  }

  // Build and show suggestions (query: lowercase)
  function renderSuggestions(query) {
    if (!suggestionsDiv || !input) return;
    suggestionsDiv.innerHTML = '';
    currentFocus = -1;

    if (!query) {
      hideSuggestions();
      return;
    }

    if (!systems || !systems.length) {
      // still loading or failed
      console.log('No systems loaded yet; suggestions unavailable');
      hideSuggestions();
      return;
    }

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

  // escape helper for safety when injecting system names
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // key handling for input
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

  function setActive(items) {
    items.forEach(i => i.classList.remove('active'));
    if (currentFocus > -1 && items[currentFocus]) items[currentFocus].classList.add('active');
    // ensure active item is visible (scroll into view if needed)
    const active = items[currentFocus];
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  // click outside => hide
  document.addEventListener('click', (ev) => {
    if (!input) return;
    if (ev.target === input || suggestionsDiv.contains(ev.target)) return;
    hideSuggestions();
  });

  // make lookup button clickable with pointer if CSS doesn't set it
  lookupBtn.style.cursor = lookupBtn.style.cursor || 'pointer';
  lookupBtn.addEventListener('click', runLookup);

  async function runLookup() {
    const name = input.value.trim().toLowerCase();
    if (!name) return;
    if (!systems || !systems.length) {
      outputDiv.innerHTML = '<p>Systems data still loading, try again in a moment.</p>';
      return;
    }

    const system = systems.find(s => s.system.toLowerCase() === name);
    if (!system) {
      outputDiv.innerHTML = `<p>System "${escapeHtml(input.value)}" not found!</p>`;
      return;
    }

    outputDiv.innerHTML = `<p>Fetching kills and jumps for ${escapeHtml(system.system)}...</p>`;

    try {
      const [killsRes, jumpsRes] = await Promise.all([
        fetch('https://esi.evetech.net/latest/universe/system_kills/?datasource=tranquility'),
        fetch('https://esi.evetech.net/latest/universe/system_jumps/?datasource=tranquility')
      ]);
      const killsData = await killsRes.json();
      const jumpsData = await jumpsRes.json();

      const systemKillsObj = Array.isArray(killsData) ? killsData.find(k => k.system_id === system.system_id) : null;
      const systemJumpsObj = Array.isArray(jumpsData) ? jumpsData.find(j => j.system_id === system.system_id) : null;

      const kills = systemKillsObj ? (systemKillsObj.ship_kills || 0) : 0;
      const jumps = systemJumpsObj ? (systemJumpsObj.ship_jumps || 0) : 0;

      const sec = typeof system.security_status === 'number' ? system.security_status : null;
      const secClass = (sec === null) ? '' : (sec >= 0.5 ? 'sec-high' : (sec > 0 ? 'sec-low' : 'sec-null'));
      const killClass = (kills >= 5) ? 'kills-high' : "";

      outputDiv.innerHTML = `
        <p><b>Name:</b> ${escapeHtml(system.system)}</p>
        <p><b>Constellation:</b> ${escapeHtml(system.constellation || 'Unknown')}</p>
        <p><b>Region:</b> ${escapeHtml(system.region || 'Unknown')}</p>
        <p><b>Security Status:</b> ${sec === null ? 'N/A' : `<span class="${secClass}">${sec.toFixed(1)}</span>`}</p>
        <p><b>Kills (last hour):</b> <span class="${killClass}">${kills}</span></p>
        <p><b>Jumps (last hour):</b> ${jumps}</p>
      `;
    } catch (err) {
      console.error(err);
      outputDiv.innerHTML = '<p>Error fetching kills/jumps. See console.</p>';
    }
  }

})();
