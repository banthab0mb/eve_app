(() => {
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

  // Get color value for security status
  function secClass(sec) {
    if (sec >= 1) return "sec-blue";
    if (sec >= 0.9) return "sec-lighter-blue";
    if (sec >= 0.8) return "sec-high-blue";
    if (sec >= 0.7) return "sec-sea";
    if (sec >= 0.6) return "sec-green";
    if (sec >= 0.5) return "sec-yellow";
    if (sec >= 0.4) return "sec-low";
    if (sec >= 0.3) return "sec-rorange";
    if (sec >= 0.2) return "sec-red";
    if (sec >= 0.1) return "sec-purple";
    return "sec-null";
  }

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

  // escape helper for safety when injecting system names
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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

  // Sleep helper for rate limiting
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function getPvpKills(systemId) {
    try {
      const res = await fetch(
        `https://zkillboard.com/api/kills/systemID/${systemId}/pastSeconds/3600/`,
        {
          headers: {
            "Accept-Encoding": "gzip",
            "User-Agent": "https://banthab0mb.github.io/eve_app/ Maintainer: banthab0mb@gmail.com"
          }
        }
      );

      const kills = await res.json();
      if (!Array.isArray(kills)) return 0;

      // Only count real PvP (zkb.npc === false)
      const pvpKills = kills.filter(k => k.zkb && !k.zkb.npc);
      return pvpKills.length;

    } catch (err) {
      console.error("zKill fetch failed", err);
      return 0;
    }
  }

  // Look up the kills and jumps for the inputted system
  async function runLookup() {
    const name = input.value.trim().toLowerCase();

    // Escape logic
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

    // Loading text
    outputDiv.innerHTML = `<p>Fetching kills and jumps for <b>${escapeHtml(system.system)}</b>...</p>`;

    // Api logic
    try {
      const [jumpsRes] = await Promise.all([
        fetch('https://esi.evetech.net/latest/universe/system_jumps/?datasource=tranquility')
      ]);
      const jumpsData = await jumpsRes.json();

      const systemJumpsObj = Array.isArray(jumpsData) ? jumpsData.find(j => j.system_id === system.system_id) : null;

      // Jumps variable assignment
      const jumps = systemJumpsObj ? (systemJumpsObj.ship_jumps || 0) : 0;

      // Round security to 1 decimal place
      const sec = parseFloat(system.security_status.toFixed(1)).toFixed(1);

      // Call secClass function with above value as parameter to get color for displaying
      const cls = secClass(sec);

      const kills = await getPvpKills(system.system_id);
      // Determine if highlighting is needed for kill amount
      const killClass = (kills >= 5) ? 'kills-high' : "";

      // Display results
      outputDiv.innerHTML = `
        <p><b>Name:</b> ${escapeHtml(system.system)}</p>
        <p><b>Constellation:</b> ${escapeHtml(system.constellation || 'Unknown')}</p>
        <p><b>Region:</b> ${escapeHtml(system.region || 'Unknown')}</p>
        <p><b>Security Status:</b> <span class="${cls}">${sec}</span></p>
        <p><b>Kills (last hour):</b> <span class="${killClass}">${kills}</span></p>
        <p><b>Jumps (last hour):</b> ${jumps}</p>
      `;
    } catch (err) {
      console.error(err);
      outputDiv.innerHTML = '<p>Error fetching kills/jumps. See console.</p>';
    }
  }

})();
