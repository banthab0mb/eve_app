(() => {
  // Assign elements
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
  let systemsLoaded = false;
  let currentFocus = -1;

  // Load systems.json
  fetch('systems.json')
    .then(res => res.json())
    .then(data => {
      systems = data;
      systemsLoaded = true;
      console.log('systems.json loaded, systems:', systems.length);

      // Auto-run if ?system= in URL
      const urlParams = new URLSearchParams(window.location.search);
      const sysFromURL = urlParams.get('system');
      if (sysFromURL) {
        input.value = sysFromURL;
        runLookup();
      }
    })
    .catch(err => console.error('Failed to load systems.json:', err));

  // Security status color helper
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

  // Suggestions helpers
  function hideSuggestions() {
    suggestionsDiv.innerHTML = '';
    suggestionsDiv.style.display = 'none';
    currentFocus = -1;
  }
  function showSuggestionsContainer() {
    suggestionsDiv.style.display = 'block';
  }

  function renderSuggestions(query) {
    if (!suggestionsDiv || !input) return;
    suggestionsDiv.innerHTML = '';
    currentFocus = -1;

    if (!query || !systemsLoaded) {
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

    const rect = input.getBoundingClientRect();
    suggestionsDiv.style.minWidth = `${rect.width}px`;

    matches.forEach((s, idx) => {
      const div = document.createElement('div');
      div.className = 'suggestion';
      div.setAttribute('data-idx', idx);
      div.innerHTML = `${escapeHtml(s.system)} <span class="region">(${escapeHtml(s.region || 'Unknown')})</span>`;
      div.style.cursor = 'pointer';

      div.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        input.value = s.system;
        hideSuggestions();
        input.focus();
        updateURL(s.system);
      });
      suggestionsDiv.appendChild(div);
    });

    showSuggestionsContainer();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  input.addEventListener('input', () => renderSuggestions(input.value.trim().toLowerCase()));

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
          input.value = chosen.textContent.replace(/\s\(.+\)$/, '').trim();
          hideSuggestions();
          updateURL(input.value);
          return;
        }
      }
      e.preventDefault();
      runLookup();
    }
  });

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

  lookupBtn.style.cursor = lookupBtn.style.cursor || 'pointer';
  lookupBtn.addEventListener('click', runLookup);

  const CACHE_TTL = 60 * 60 * 1000;
  const CACHE_KEY = "killCache";

  function loadKillCache() { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); }
  function saveKillCache(cache) { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); }

  window.clearKillCache = () => {
    localStorage.removeItem(CACHE_KEY);
    console.log("Kill cache cleared!");
  };

  async function getPvpKills(systemId) {
    const now = Date.now();
    let killCache = loadKillCache();
    if (killCache[systemId] && now - killCache[systemId].time < CACHE_TTL) {
      return killCache[systemId].kills;
    }
    try {
      const res = await fetch(`https://zkillboard.com/api/kills/systemID/${systemId}/pastSeconds/3600/`, {
        headers: {
          "Accept-Encoding": "gzip",
          "User-Agent": "https://banthab0mb.github.io/eve_app/ Maintainer: banthab0mb@gmail.com"
        }
      });
      const kills = await res.json();
      const pvpKills = Array.isArray(kills) ? kills.filter(k => k.zkb && !k.zkb.npc).length : 0;
      killCache[systemId] = { time: now, kills: pvpKills };
      saveKillCache(killCache);
      return pvpKills;
    } catch (err) {
      console.error("zKill fetch failed", err);
      return 0;
    }
  }

  async function runLookup() {
    const name = input.value.trim().toLowerCase();
    if (!name) return;

    if (!systemsLoaded) {
      outputDiv.innerHTML = '<p>Systems data still loading, please wait...</p>';
      return;
    }

    updateURL(name);

    const system = systems.find(s => s.system.toLowerCase() === name);
    if (!system) {
      outputDiv.innerHTML = `<p>System "${escapeHtml(input.value)}" not found!</p>`;
      return;
    }

    outputDiv.innerHTML = `<p>Fetching kills and jumps for <b>${escapeHtml(system.system)}</b>...</p>`;

    try {
      const jumpsRes = await fetch('https://esi.evetech.net/latest/universe/system_jumps/?datasource=tranquility');
      const jumpsData = await jumpsRes.json();
      const systemJumpsObj = Array.isArray(jumpsData) ? jumpsData.find(j => j.system_id === system.system_id) : null;
      const jumps = systemJumpsObj ? (systemJumpsObj.ship_jumps || 0) : 0;
      const sec = parseFloat(system.security_status.toFixed(1)).toFixed(1);
      const cls = secClass(sec);
      const kills = await getPvpKills(system.system_id);
      const killClass = (kills >= 5) ? 'kills-high' : "";

      outputDiv.innerHTML = `
        <p><b>Name:</b> ${escapeHtml(system.system)}</p>
        <p><b>Constellation:</b> ${escapeHtml(system.constellation || 'Unknown')}</p>
        <p><b>Region:</b> ${escapeHtml(system.region || 'Unknown')}</p>
        <p><b>Security Status:</b> <span class="${cls}">${sec}</span></p>
        <p><b>Kills (last hour):</b> <span class="${killClass}">${kills}</span></p>
        <p><b>Jumps (last hour):</b> ${jumps}</p>
        <p><b><a href="https://zkillboard.com/system/${system.system_id}">zKillboard</a></p>
      `;
    } catch (err) {
      console.error(err);
      outputDiv.innerHTML = '<p>Error fetching kills/jumps. See console.</p>';
    }
  }

  function updateURL(systemName) {
    const params = new URLSearchParams(window.location.search);
    params.set('system', systemName);
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
  }
})();
