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
      console.log('systems.json loaded:', systems.length);

      // Auto-run if ?system= in URL
      const urlParams = new URLSearchParams(window.location.search);
      const sysFromURL = urlParams.get('system');
      if (sysFromURL) {
        input.value = sysFromURL;
        runLookup();
      }
    })
    .catch(err => console.error('Failed to load systems.json:', err));

  // Security color helper
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

  // Suggestions
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

  // Cache helpers
  const CACHE_TTL = 60 * 60 * 1000;
  const CACHE_KEY = "killCache";
  function loadKillCache() { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); }
  function saveKillCache(cache) { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); }

  window.clearKillCache = () => {
    localStorage.removeItem(CACHE_KEY);
    console.log("Kill cache cleared!");
  };

  // zKill fetch
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

  // Chart instances
  let jumpsChart, npcKillsChart, shipKillsChart, podKillsChart;

  async function runLookup() {
    const name = input.value.trim().toLowerCase();
    if (!name) return;

    if (!systemsLoaded) {
      outputDiv.innerHTML = '<p>Systems data still loading...</p>';
      return;
    }

    updateURL(name);
    const system = systems.find(s => s.system.toLowerCase() === name);
    if (!system) {
      outputDiv.innerHTML = `<p>System "${escapeHtml(input.value)}" not found!</p>`;
      return;
    }

    outputDiv.innerHTML = `<p>Fetching system data for <b>${escapeHtml(system.system)}</b>...</p>`;

    try {
      const [jumpsRes, killsRes] = await Promise.all([
        fetch('https://esi.evetech.net/latest/universe/system_jumps/?datasource=tranquility'),
        fetch('https://esi.evetech.net/latest/universe/system_kills/?datasource=tranquility')
      ]);

      const jumpsData = await jumpsRes.json();
      const killsData = await killsRes.json();

      const systemJumpsObj = jumpsData.find(j => j.system_id === system.system_id);
      const systemKillsObj = killsData.find(k => k.system_id === system.system_id);

      const jumps = systemJumpsObj ? systemJumpsObj.ship_jumps || 0 : 0;
      const npcKills = systemKillsObj ? systemKillsObj.npc_kills || 0 : 0;
      const shipKills = systemKillsObj ? systemKillsObj.ship_kills || 0 : 0;
      const podKills = systemKillsObj ? systemKillsObj.pod_kills || 0 : 0;

      const sec = parseFloat(system.security_status.toFixed(1)).toFixed(1);
      const cls = secClass(sec);
      const pvpKills = await getPvpKills(system.system_id);

      const killClass = (pvpKills >= 5) ? 'kills-high' : "";

      document.querySelector(".charts-wrapper").style.display = "flex";

      outputDiv.querySelector("#systemInfoTable").innerHTML = `
        <tr><th>Name</th><td>${escapeHtml(system.system)}</td></tr>
        <tr><th>Constellation</th><td>${escapeHtml(system.constellation || 'Unknown')}</td></tr>
        <tr><th>Region</th><td>${escapeHtml(system.region || 'Unknown')}</td></tr>
        <tr><th>Security Status</th><td class="${cls}">${sec}</td></tr>
        <tr><th>Kills (last hour)</th><td class="${killClass}">${pvpKills}</td></tr>
        <tr><th>Jumps (last hour)</th><td>${jumps}</td></tr>
      `;

      renderCharts(jumps, npcKills, shipKills, podKills);
    } catch (err) {
      console.error(err);
      outputDiv.innerHTML = '<p>Error fetching data. See console.</p>';
    }
  }

  function renderCharts(jumps, npcKills, shipKills, podKills) {
    const config = (label, data, color) => ({
      type: 'bar',
      data: {
        labels: [label],
        datasets: [{
          data: [data],
          backgroundColor: color,
        }]
      },
      options: {
        scales: {
          x: { display: false },
          y: { beginAtZero: true, ticks: { color: '#ccc' } }
        },
        plugins: { legend: { display: false } },
      }
    });

    if (!window.Chart) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
      script.onload = () => renderCharts(jumps, npcKills, shipKills, podKills);
      document.body.appendChild(script);
      return;
    }

    const ctxJumps = document.getElementById('jumpsChart');
    const ctxNpc = document.getElementById('npcKillsChart');
    const ctxShip = document.getElementById('shipKillsChart');
    const ctxPod = document.getElementById('podKillsChart');

    [jumpsChart, npcKillsChart, shipKillsChart, podKillsChart].forEach(c => c?.destroy?.());

    jumpsChart = new Chart(ctxJumps, config('Jumps Last 48h', jumps, '#4bcef4'));
    npcKillsChart = new Chart(ctxNpc, config('NPC Kills Last 48h', npcKills, '#60daa6'));
    shipKillsChart = new Chart(ctxShip, config('Ship Kills Last 48h', shipKills, '#dc6c09'));
    podKillsChart = new Chart(ctxPod, config('Pod Kills Last 48h', podKills, '#bc1116'));
  }

  function updateURL(systemName) {
    const params = new URLSearchParams(window.location.search);
    params.set('system', systemName);
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
  }

})();