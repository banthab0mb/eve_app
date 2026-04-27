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
  let chartInstances = {};

  // Load Chart.js if not already present
  function loadChartJs() {
    return new Promise((resolve) => {
      if (window.Chart) return resolve();
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
      script.onload = resolve;
      document.head.appendChild(script);
    });
  }

  // Load systems.json
  fetch('systems.json')
    .then(res => res.json())
    .then(data => {
      systems = data;
      systemsLoaded = true;

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

    if (!query || !systemsLoaded) { hideSuggestions(); return; }

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

  const ZKILL_HEADERS = {
    "Accept-Encoding": "gzip",
    "User-Agent": "https://banthab0mb.github.io/eve_app/ Maintainer: banthab0mb@gmail.com"
  };

  // Bucket killmails by minute into 60 slots (index 0 = oldest, 59 = most recent)
  function bucketByMinute(killmails) {
    const now = Date.now();
    const buckets = new Array(60).fill(0);
    for (const km of killmails) {
      const t = new Date(km.killmail_time).getTime();
      const minsAgo = Math.floor((now - t) / 60000);
      if (minsAgo >= 0 && minsAgo < 60) {
        buckets[59 - minsAgo]++;
      }
    }
    return buckets;
  }

  // Fetch zKill killmails and split into ship/pod/npc buckets
  async function getZkillData(systemId) {
    const now = Date.now();
    let cache = loadKillCache();
    const cacheKey = `zkill_${systemId}`;

    if (cache[cacheKey] && now - cache[cacheKey].time < CACHE_TTL) {
      return cache[cacheKey].data;
    }

    try {
      const [allKills, npcKills] = await Promise.all([
        fetch(`https://zkillboard.com/api/kills/systemID/${systemId}/pastSeconds/3600/`, { headers: ZKILL_HEADERS }).then(r => r.json()),
        fetch(`https://zkillboard.com/api/npc/systemID/${systemId}/pastSeconds/3600/`, { headers: ZKILL_HEADERS }).then(r => r.json())
      ]);

      const allArr = Array.isArray(allKills) ? allKills : [];
      const npcArr = Array.isArray(npcKills) ? npcKills : [];

      const npcIds = new Set(npcArr.map(k => k.killmail_id));
      const shipKills = allArr.filter(k => !npcIds.has(k.killmail_id) && !(k.zkb && k.zkb.labels && k.zkb.labels.includes('pod')));
      const podKills = allArr.filter(k => k.zkb && k.zkb.labels && k.zkb.labels.includes('pod'));

      const data = {
        shipBuckets: bucketByMinute(shipKills),
        podBuckets: bucketByMinute(podKills),
        npcBuckets: bucketByMinute(npcArr),
        shipTotal: shipKills.length,
        podTotal: podKills.length,
        npcTotal: npcArr.length
      };

      cache[cacheKey] = { time: now, data };
      saveKillCache(cache);
      return data;
    } catch (err) {
      console.error("zKill fetch failed", err);
      return { shipBuckets: new Array(60).fill(0), podBuckets: new Array(60).fill(0), npcBuckets: new Array(60).fill(0), shipTotal: 0, podTotal: 0, npcTotal: 0 };
    }
  }

  // Fetch system jumps from ESI (zKill doesn't track jumps)
  async function getSystemJumps(systemId) {
    try {
      const res = await fetch('https://esi.evetech.net/latest/universe/system_jumps/?datasource=tranquility');
      const data = await res.json();
      const entry = Array.isArray(data) ? data.find(s => s.system_id === systemId) : null;
      return entry ? entry.ship_jumps : 0;
    } catch {
      return 0;
    }
  }

  // Fetch station info for a system
  async function getStations(systemId) {
    try {
      const sysRes = await fetch(`https://esi.evetech.net/latest/universe/systems/${systemId}/?datasource=tranquility`);
      const sysData = await sysRes.json();
      const stationIds = sysData.stations || [];
      if (!stationIds.length) return [];

      const stations = await Promise.all(stationIds.map(async (sid) => {
        try {
          const res = await fetch(`https://esi.evetech.net/latest/universe/stations/${sid}/?datasource=tranquility`);
          return await res.json();
        } catch {
          return null;
        }
      }));
      return stations.filter(Boolean);
    } catch {
      return [];
    }
  }

  // Build a mini line chart from real per-minute buckets
  function buildChart(canvasId, label, buckets, color) {
    if (chartInstances[canvasId]) {
      chartInstances[canvasId].destroy();
      delete chartInstances[canvasId];
    }

    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const now = new Date();
    const labels = [];
    const dataPoints = buckets;
    for (let i = 59; i >= 0; i--) {
      const t = new Date(now.getTime() - i * 60000);
      labels.push(`${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}`);
    }

    const ctx = canvas.getContext('2d');
    chartInstances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label,
          data: dataPoints,
          borderColor: color,
          backgroundColor: color + '22',
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => items[0].label,
              label: (item) => `${label}: ${item.raw}`
            }
          }
        },
        scales: {
          x: {
            ticks: {
              maxTicksLimit: 6,
              color: '#aaa',
              font: { size: 10 }
            },
            grid: { color: '#333' }
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#aaa', font: { size: 10 } },
            grid: { color: '#333' }
          }
        }
      }
    });
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

    outputDiv.innerHTML = `<p>Fetching data for <b>${escapeHtml(system.system)}</b>...</p>`;

    await loadChartJs();

    try {
      const [jumps, killsData, pvpKills, stations] = await Promise.all([
        getSystemJumps(system.system_id),
        getSystemKills(system.system_id),
        getPvpKills(system.system_id),
        getStations(system.system_id)
      ]);

      const sec = parseFloat(system.security_status.toFixed(1)).toFixed(1);
      const cls = secClass(sec);
      const shipKills = killsData.ship_kills || 0;
      const npcKills = killsData.npc_kills || 0;
      const podKills = killsData.pod_kills || 0;

      const stationsHtml = stations.length
        ? `<table class="stations-table">
            <tr><th>Name</th><th>Type ID</th></tr>
            ${stations.map(s => `<tr><td>${escapeHtml(s.name || 'Unknown')}</td><td>${s.type_id || ''}</td></tr>`).join('')}
           </table>`
        : '<p style="opacity:0.6">No NPC stations</p>';

      outputDiv.innerHTML = `
        <div class="sys-panel">

          <div class="sys-stats-grid">
            <div class="stat-block">
              <div class="stat-label">System</div>
              <div class="stat-value">${escapeHtml(system.system)}</div>
            </div>
            <div class="stat-block">
              <div class="stat-label">Region</div>
              <div class="stat-value">${escapeHtml(system.region || 'Unknown')}</div>
            </div>
            <div class="stat-block">
              <div class="stat-label">Constellation</div>
              <div class="stat-value">${escapeHtml(system.constellation || 'Unknown')}</div>
            </div>
            <div class="stat-block">
              <div class="stat-label">Security</div>
              <div class="stat-value ${cls}">${sec}</div>
            </div>
            <div class="stat-block">
              <div class="stat-label">Jumps (1h)</div>
              <div class="stat-value">${jumps}</div>
            </div>
            <div class="stat-block">
              <div class="stat-label">Ship Kills (1h)</div>
              <div class="stat-value">${shipKills}</div>
            </div>
            <div class="stat-block">
              <div class="stat-label">NPC Kills (1h)</div>
              <div class="stat-value">${npcKills}</div>
            </div>
            <div class="stat-block">
              <div class="stat-label">Pod Kills (1h)</div>
              <div class="stat-value">${podKills}</div>
            </div>
            <div class="stat-block">
              <div class="stat-label">zKillboard</div>
              <div class="stat-value"><a href="https://zkillboard.com/system/${system.system_id}/" target="_blank">View</a></div>
            </div>
          </div>

          <div class="sys-charts-grid">
            <div class="chart-block">
              <div class="chart-title">Jumps (last hour)</div>
              <div class="chart-wrap"><canvas id="chart-jumps"></canvas></div>
            </div>
            <div class="chart-block">
              <div class="chart-title">NPC Kills (last hour)</div>
              <div class="chart-wrap"><canvas id="chart-npc"></canvas></div>
            </div>
            <div class="chart-block">
              <div class="chart-title">Ship Kills (last hour)</div>
              <div class="chart-wrap"><canvas id="chart-ship"></canvas></div>
            </div>
            <div class="chart-block">
              <div class="chart-title">Pod Kills (last hour)</div>
              <div class="chart-wrap"><canvas id="chart-pod"></canvas></div>
            </div>
          </div>

          <div class="sys-stations">
            <div class="stations-title">Stations</div>
            ${stationsHtml}
          </div>

        </div>

        <style>
          .sys-panel { display: flex; flex-direction: column; gap: 1.5rem; }

          .sys-stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
            gap: 0.75rem;
          }

          .stat-block {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 6px;
            padding: 0.6rem 0.8rem;
          }

          .stat-label {
            font-size: 0.7rem;
            opacity: 0.5;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 0.2rem;
          }

          .stat-value {
            font-size: 1rem;
            font-weight: bold;
          }

          .sys-charts-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
            gap: 1rem;
          }

          .chart-block {
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 6px;
            padding: 0.75rem;
          }

          .chart-title {
            font-size: 0.75rem;
            opacity: 0.6;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 0.5rem;
          }

          .chart-wrap {
            height: 140px;
            position: relative;
          }

          .stations-title {
            font-size: 0.75rem;
            opacity: 0.5;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 0.5rem;
          }

          .stations-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.85rem;
          }

          .stations-table th, .stations-table td {
            text-align: left;
            padding: 0.4rem 0.6rem;
            border-bottom: 1px solid rgba(255,255,255,0.07);
          }

          .stations-table th {
            opacity: 0.5;
            font-weight: normal;
            font-size: 0.75rem;
            text-transform: uppercase;
          }
        </style>
      `;

      // Build charts after DOM is updated
      buildChart('chart-jumps', 'Jumps', jumps, '#5b9bd5');
      buildChart('chart-npc', 'NPC Kills', npcKills, '#a0c878');
      buildChart('chart-ship', 'Ship Kills', shipKills, '#e06c6c');
      buildChart('chart-pod', 'Pod Kills', podKills, '#c678dd');

    } catch (err) {
      console.error(err);
      outputDiv.innerHTML = '<p>Error fetching data. See console.</p>';
    }
  }

  function updateURL(systemName) {
    const params = new URLSearchParams(window.location.search);
    params.set('system', systemName);
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
  }
})();