(() => {
  const input = document.querySelector('#systemName') || document.querySelector('.search-box');
  const suggestionsDiv =
    (input && input.parentElement && input.parentElement.querySelector('.suggestions')) ||
    document.getElementById('suggestions') ||
    document.querySelector('.suggestions');
  const lookupBtn =
    document.getElementById('lookupBtn') ||
    document.querySelector('.search-button') ||
    document.querySelector('button');
  const outputDiv = document.getElementById('output') || document.querySelector('.output');

  if (!input || !suggestionsDiv || !lookupBtn || !outputDiv) {
    console.warn('systemSearch.js: missing required elements');
  }

  let systems = [];
  let factions = []; 
  let dataLoaded = false; 
  let currentFocus = -1;
  let killChart = null;
  
  // Local runtime cache to avoid calling ESI repeatedly for the same item types
  const typeNameCache = {}; 

  Promise.all([
    fetch('systems.json').then(res => res.json()),
    fetch('factions.json').then(res => res.json()).catch(err => {
      console.warn('Failed to load factions.json locally, falling back:', err);
      return []; 
    })
  ])
    .then(([systemsData, factionsData]) => {
      systems = systemsData;
      factions = factionsData;
      dataLoaded = true;

      const urlParams = new URLSearchParams(window.location.search);
      const sysFromURL = urlParams.get('system');
      if (sysFromURL) {
        input.value = sysFromURL;
        runLookup();
      }
    })
    .catch(err => console.error('Critical error loading local configuration files:', err));

  function secClass(sec) {
    if (sec >= 1.0) return "sec-blue";
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

  function secLabel(sec) {
    if (sec >= 0.5) return "High-sec";
    if (sec >= 0.1) return "Low-sec";
    return "Null-sec";
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function hideSuggestions() {
    suggestionsDiv.innerHTML = '';
    suggestionsDiv.style.display = 'none';
    currentFocus = -1;
  }

  function renderSuggestions(query) {
    suggestionsDiv.innerHTML = '';
    currentFocus = -1;
    if (!query || !dataLoaded) { hideSuggestions(); return; }
    const matches = systems.filter(s => s.system.toLowerCase().startsWith(query)).slice(0, 12);
    if (!matches.length) { hideSuggestions(); return; }
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
    suggestionsDiv.style.display = 'block';
  }

  input.addEventListener('input', () => renderSuggestions(input.value.trim().toLowerCase()));

  input.addEventListener('keydown', (e) => {
    const items = suggestionsDiv.querySelectorAll('.suggestion');
    if (e.key === 'ArrowDown') {
      if (!items.length) return;
      currentFocus = (currentFocus + 1) % items.length;
      setActive(items); e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      if (!items.length) return;
      currentFocus = (currentFocus - 1 + items.length) % items.length;
      setActive(items); e.preventDefault();
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

  lookupBtn.style.cursor = 'pointer';
  lookupBtn.addEventListener('click', runLookup);

  const CACHE_TTL = 60 * 60 * 1000;
  const CACHE_KEY = "killCache";
  const STATS_CACHE_KEY = "statsCache";

  function loadCache(key) { try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; } }
  function saveCache(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

  async function getPvpKills(systemId) {
    const now = Date.now();
    const cache = loadCache(CACHE_KEY);
    if (cache[systemId] && now - cache[systemId].time < CACHE_TTL) return cache[systemId].kills;
    try {
      const res = await fetch(`https://zkillboard.com/api/kills/systemID/${systemId}/pastSeconds/3600/`, {
        headers: { "Accept-Encoding": "gzip", "User-Agent": "https://banthab0mb.github.io/eve_app/ Maintainer: banthab0mb@gmail.com" }
      });
      const kills = await res.json();
      const pvpKills = Array.isArray(kills) ? kills.filter(k => k.zkb && !k.zkb.npc).length : 0;
      const c = loadCache(CACHE_KEY);
      c[systemId] = { time: now, kills: pvpKills };
      saveCache(CACHE_KEY, c);
      return pvpKills;
    } catch { return 0; }
  }

  async function getKillStats(systemId) {
    const now = Date.now();
    const cache = loadCache(STATS_CACHE_KEY);
    if (cache[systemId] && now - cache[systemId].time < CACHE_TTL * 6) return cache[systemId].data;
    try {
      const res = await fetch(`https://zkillboard.com/api/stats/systemID/${systemId}/`, {
        headers: { "Accept-Encoding": "gzip", "User-Agent": "https://banthab0mb.github.io/eve_app/ Maintainer: banthab0mb@gmail.com" }
      });
      const data = await res.json();
      const c = loadCache(STATS_CACHE_KEY);
      c[systemId] = { time: now, data };
      saveCache(STATS_CACHE_KEY, c);
      return data;
    } catch { return null; }
  }

  async function getSystemDetails(systemId) {
    try {
      const res = await fetch(`https://esi.evetech.net/latest/universe/systems/${systemId}/?datasource=tranquility`);
      return await res.json();
    } catch { return null; }
  }

  async function getStationInfo(stationId) {
    try {
      const res = await fetch(`https://esi.evetech.net/latest/universe/stations/${stationId}/?datasource=tranquility`);
      return await res.json();
    } catch { return null; }
  }

  async function getSovereignty() {
    try {
      const res = await fetch('https://esi.evetech.net/latest/sovereignty/map/?datasource=tranquility');
      return await res.json();
    } catch { return []; }
  }

  async function getAllianceName(allianceId) {
    if (!allianceId) return null;
    try {
      const res = await fetch(`https://esi.evetech.net/latest/alliances/${allianceId}/?datasource=tranquility`);
      const d = await res.json();
      return d.name || null;
    } catch { return null; }
  }

  async function getCorpName(corpId) {
    if (!corpId) return null;
    try {
      const res = await fetch(`https://esi.evetech.net/latest/corporations/${corpId}/?datasource=tranquility`);
      const d = await res.json();
      return d.name || null;
    } catch { return null; }
  }

  function getLocalFactionName(factionId) {
    if (!factionId || !factions.length) return null;
    const match = factions.find(f => f.faction_id === factionId);
    return match ? match.name : null;
  }

  // --- REFINED: Targets the type_id endpoint directly to grab item names ---
  async function getTypeName(typeId) {
    if (!typeId) return 'Unknown';
    if (typeNameCache[typeId]) return typeNameCache[typeId];
    try {
      // Direct call to universe/types/{type_id}
      const res = await fetch(`https://esi.evetech.net/latest/universe/types/${typeId}/?datasource=tranquility`);
      const d = await res.json();
      if (d && d.name) {
        typeNameCache[typeId] = d.name; // Cache the string directly
        return d.name;
      }
      return `Type ${typeId}`;
    } catch { 
      return `Type ${typeId}`; 
    }
  }

  function formatServices(services) {
    if (!services || !services.length) return 'None';
    const labels = {
      'bounty-missions': 'Bounty Missions', 'assay-office': 'Assay Office',
      'reprocessing-plant': 'Reprocessing', 'repair-facilities': 'Repair',
      'factory': 'Manufacturing', 'labratory': 'Research Lab',
      'laboratory': 'Research Lab', 'market': 'Market',
      'black-market': 'Black Market', 'stock-exchange': 'Stock Exchange',
      'cloning': 'Cloning', 'surgery': 'Surgery',
      'dna-therapy': 'DNA Therapy', 'fitting': 'Fitting',
      'news': 'News', 'storage': 'Storage',
      'insurance': 'Insurance', 'docking': 'Docking',
      'office-rental': 'Office Rental', 'loyalty-point-store': 'LP Store',
      'navy-offices': 'Navy Offices', 'security-office': 'Security Office',
      'interbus': 'Interbus', 'mission-network': 'Mission Network',
      'reagent': 'Reagent', 'scanner': 'Scanner',
    };
    return services.map(s => labels[s] || s.replace(/-/g, ' ')).join(', ');
  }

  function buildKillChart(monthlyData) {
    const canvas = document.getElementById('killHistoryChart');
    if (!canvas) return;
    if (killChart) { killChart.destroy(); killChart = null; }
    if (!monthlyData || !Object.keys(monthlyData).length) {
      canvas.parentElement.style.display = 'none';
      return;
    }
    canvas.parentElement.style.display = 'block';

    const sorted = Object.entries(monthlyData)
      .map(([k, v]) => ({ label: k, count: typeof v === 'number' ? v : (v.count || 0) }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(-12);

    const labels = sorted.map(d => {
      const [year, month] = d.label.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1);
      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    });
    const data = sorted.map(d => d.count);

    killChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Kills',
          data,
          backgroundColor: 'rgba(200, 80, 80, 0.7)',
          borderColor: 'rgba(200, 80, 80, 1)',
          borderWidth: 1,
          borderRadius: 3,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.parsed.y} kills`
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#aaa', font: { size: 11 }, autoSkip: false, maxRotation: 45 },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: {
            ticks: { color: '#aaa', font: { size: 11 }, precision: 0 },
            grid: { color: 'rgba(255,255,255,0.05)' },
            beginAtZero: true
          }
        }
      }
    });
  }

  async function runLookup() {
    const name = input.value.trim().toLowerCase();
    if (!name) return;
    if (!dataLoaded) { outputDiv.innerHTML = '<p>Systems data still loading, please wait...</p>'; return; }
    updateURL(name);

    const system = systems.find(s => s.system.toLowerCase() === name);
    if (!system) { outputDiv.innerHTML = `<p>System "${escapeHtml(input.value)}" not found.</p>`; return; }

    const sec = parseFloat(system.security_status.toFixed(1)).toFixed(1);
    const cls = secClass(sec);
    const label = secLabel(parseFloat(sec));

    outputDiv.innerHTML = `<p class="loading-msg">Loading data for <b>${escapeHtml(system.system)}</b>...</p>`;

    const [jumpsData, pvpKills, details, sovMap, statsRaw] = await Promise.all([
      fetch('https://esi.evetech.net/latest/universe/system_jumps/?datasource=tranquility').then(r => r.json()).catch(() => []),
      getPvpKills(system.system_id),
      getSystemDetails(system.system_id),
      getSovereignty(),
      getKillStats(system.system_id)
    ]);

    const systemJumpsObj = Array.isArray(jumpsData) ? jumpsData.find(j => j.system_id === system.system_id) : null;
    const jumps = systemJumpsObj ? (systemJumpsObj.ship_jumps || 0) : 0;
    const killClass = kills => kills >= 5 ? 'kills-high' : '';

    // Planet info
    const planetCount = details && details.planets ? details.planets.length : '?';
    const starName = details && details.star_id ? `Star ID ${details.star_id}` : 'Unknown';
    const securityClass = details && details.security_class ? details.security_class : '';

    // Station fetch (NPC stations from ESI system details)
    const stationIds = (details && details.stations) ? details.stations : [];
    const stationDataArr = await Promise.all(stationIds.slice(0, 10).map(id => getStationInfo(id)));
    const validStations = stationDataArr.filter(Boolean);

    // Sovereignty lookup
    const sovEntry = Array.isArray(sovMap) ? sovMap.find(s => s.system_id === system.system_id) : null;
    let sovHtml = '';
    if (sovEntry && (sovEntry.alliance_id || sovEntry.corporation_id || sovEntry.faction_id)) {
      const [allianceName, corpName] = await Promise.all([
        getAllianceName(sovEntry.alliance_id),
        getCorpName(sovEntry.corporation_id)
      ]);
      
      const factionName = getLocalFactionName(sovEntry.faction_id);

      const parts = [];
      if (allianceName) parts.push(`<span class="sov-label">Alliance:</span> <span class="sov-value">${escapeHtml(allianceName)}</span>`);
      if (corpName) parts.push(`<span class="sov-label">Corp:</span> <span class="sov-value">${escapeHtml(corpName)}</span>`);
      
      if (factionName) {
        parts.push(`<span class="sov-label">Faction:</span> <span class="sov-value">${escapeHtml(factionName)}</span>`);
      } else if (sovEntry.faction_id) {
        parts.push(`<span class="sov-label">Faction ID:</span> <span class="sov-value">${sovEntry.faction_id}</span>`);
      }

      if (parts.length) {
        sovHtml = `
          <div class="info-section">
            <h3 class="section-header">Sovereignty</h3>
            <div class="sov-grid">${parts.map(p => `<div class="sov-row">${p}</div>`).join('')}</div>
          </div>`;
      }
    }

    // Resolve all type IDs to their explicit string values via ESI context maps
    const stationTypeNames = await Promise.all(
      validStations.map(st => getTypeName(st.type_id))
    );

    // NPC stations table
    let stationsHtml = '';
    if (validStations.length) {
      const rows = validStations.map((st, index) => {
        const services = formatServices(st.services);
        const resolvedTypeName = stationTypeNames[index];
        return `<tr>
          <td>${escapeHtml(st.name)}</td>
          <td>${escapeHtml(resolvedTypeName)}</td>
          <td class="services-cell">${escapeHtml(services)}</td>
        </tr>`;
      }).join('');
      stationsHtml = `
        <div class="info-section">
          <h3 class="section-header">NPC Stations (${validStations.length})</h3>
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr><th>Name</th><th>Type</th><th>Services</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>`;
    } else {
      stationsHtml = `
        <div class="info-section">
          <h3 class="section-header">NPC Stations</h3>
          <p class="no-data">No NPC stations in this system.</p>
        </div>`;
    }

    // Monthly kill history for chart
    let monthlyKills = null;
    if (statsRaw && statsRaw.months) {
      monthlyKills = {};
      for (const [key, val] of Object.entries(statsRaw.months)) {
        const year = key.substring(0, 4);
        const month = key.substring(4, 6);
        monthlyKills[`${year}-${month}`] = val.shipsDestroyed || 0;
      }
    }

    // Activity bar visual (jumps + kills gauge)
    const maxJumpsBar = Math.max(jumps, 1);
    const maxKillsBar = Math.max(pvpKills, 1);
    const jumpsBarPct = Math.min(100, (jumps / Math.max(jumps, 100)) * 100).toFixed(0);
    const killsBarPct = Math.min(100, (pvpKills / Math.max(pvpKills, 10)) * 100).toFixed(0);

    outputDiv.innerHTML = `
      <div class="system-output">
        <div class="system-header">
          <h2 class="system-name">${escapeHtml(system.system)}</h2>
          <span class="sec-badge ${cls}">${sec} &mdash; ${escapeHtml(label)}</span>
          ${securityClass ? `<span class="sec-class-badge">Class ${escapeHtml(securityClass)}</span>` : ''}
        </div>

        <div class="stat-cards">
          <div class="stat-card">
            <div class="stat-label">Region</div>
            <div class="stat-value">${escapeHtml(system.region || 'Unknown')}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Constellation</div>
            <div class="stat-value">${escapeHtml(system.constellation || 'Unknown')}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Planets</div>
            <div class="stat-value">${planetCount}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">NPC Stations</div>
            <div class="stat-value">${validStations.length}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Kills (1h)</div>
            <div class="stat-value ${killClass(pvpKills)}">${pvpKills}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Jumps (1h)</div>
            <div class="stat-value">${jumps}</div>
          </div>
        </div>

        <div class="info-section">
          <h3 class="section-header">Current Activity</h3>
          <div class="activity-row">
            <span class="activity-label">Jumps</span>
            <div class="activity-bar-wrap">
              <div class="activity-bar jumps-bar" style="width: ${jumpsBarPct}%"></div>
            </div>
            <span class="activity-count">${jumps}</span>
          </div>
          <div class="activity-row">
            <span class="activity-label">PvP Kills</span>
            <div class="activity-bar-wrap">
              <div class="activity-bar kills-bar" style="width: ${killsBarPct}%"></div>
            </div>
            <span class="activity-count ${killClass(pvpKills)}">${pvpKills}</span>
          </div>
        </div>

        ${sovHtml}

        ${stationsHtml}

        <div class="info-section" id="chartSection" style="display: none;">
          <h3 class="section-header">Kill History (monthly)</h3>
          <div style="position: relative; width: 100%; height: 220px;">
            <canvas id="killHistoryChart" role="img" aria-label="Monthly kill history bar chart for ${escapeHtml(system.system)}">Kill history chart loading...</canvas>
          </div>
        </div>

        <div class="info-section links-section">
          <a href="https://zkillboard.com/system/${system.system_id}/" target="_blank" class="ext-link">zKillboard</a>
          <a href="https://evemaps.dotlan.net/system/${encodeURIComponent(system.system)}" target="_blank" class="ext-link">Dotlan</a>
          <a href="https://www.eveeye.com/?s=${encodeURIComponent(system.system)}" target="_blank" class="ext-link">EveEye</a>
        </div>
      </div>
    `;

    // Chart.js -- inject if not already loaded, then build chart
    if (monthlyKills && Object.keys(monthlyKills).length) {
      document.getElementById('chartSection').style.display = 'block';
      if (typeof Chart === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
        script.onload = () => buildKillChart(monthlyKills);
        document.head.appendChild(script);
      } else {
        buildKillChart(monthlyKills);
      }
    }
  }

  function updateURL(systemName) {
    const params = new URLSearchParams(window.location.search);
    params.set('system', systemName);
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
  }
})();