(() => {
  const input = document.querySelector('#systemName');
  const suggestionsDiv = document.getElementById('suggestions');
  const lookupBtn = document.getElementById('lookupBtn');
  const outputDiv = document.getElementById('output');

  let systems = [];
  let systemsLoaded = false;
  let currentFocus = -1;

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
    });

  // Security class
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
  function hideSuggestions() { suggestionsDiv.style.display = 'none'; currentFocus = -1; }
  function showSuggestionsContainer() { suggestionsDiv.style.display = 'block'; }

  function renderSuggestions(query) {
    if (!query || !systemsLoaded) { hideSuggestions(); return; }
    const matches = systems.filter(s => s.system.toLowerCase().startsWith(query)).slice(0, 12);
    if (!matches.length) { hideSuggestions(); return; }

    suggestionsDiv.innerHTML = '';
    currentFocus = -1;

    const rect = input.getBoundingClientRect();
    suggestionsDiv.style.minWidth = `${rect.width}px`;

    matches.forEach((s, idx) => {
      const div = document.createElement('div');
      div.className = 'suggestion';
      div.setAttribute('data-idx', idx);
      div.innerHTML = `${s.system} <span class="region">(${s.region || 'Unknown'})</span>`;
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

  input.addEventListener('input', () => renderSuggestions(input.value.trim().toLowerCase()));
  input.addEventListener('keydown', e => {
    const items = suggestionsDiv.querySelectorAll('.suggestion');
    if (e.key === 'ArrowDown') { currentFocus = (currentFocus + 1) % items.length; setActive(items); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { currentFocus = (currentFocus - 1 + items.length) % items.length; setActive(items); e.preventDefault(); }
    else if (e.key === 'Escape') hideSuggestions();
    else if (e.key === 'Enter') {
      if (currentFocus > -1 && items.length) {
        e.preventDefault();
        const chosen = items[currentFocus];
        if (chosen) { input.value = chosen.textContent.replace(/\s\(.+\)$/, '').trim(); hideSuggestions(); updateURL(input.value); return; }
      }
      e.preventDefault();
      runLookup();
    }
  });

  function setActive(items) { items.forEach(i => i.classList.remove('active')); if (currentFocus > -1) items[currentFocus].classList.add('active'); }

  document.addEventListener('click', ev => { if (ev.target !== input && !suggestionsDiv.contains(ev.target)) hideSuggestions(); });
  lookupBtn.addEventListener('click', runLookup);

  const CACHE_TTL = 60 * 60 * 1000;
  const CACHE_KEY = "killCache";
  function loadKillCache() { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); }
  function saveKillCache(cache) { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); }
  window.clearKillCache = () => { localStorage.removeItem(CACHE_KEY); console.log("Kill cache cleared!"); };

  async function fetchSystemData(systemId){
    const now = Date.now();
    let cache = loadKillCache();
    if(cache[systemId] && now - cache[systemId].time < CACHE_TTL) return cache[systemId].data;

    try {
      // Fetch kills from zKill
      const res = await fetch(`https://zkillboard.com/api/kills/systemID/${systemId}/pastSeconds/172800/`);
      const killsData = await res.json();

      // Fetch jumps from ESI
      const jumpsRes = await fetch('https://esi.evetech.net/latest/universe/system_jumps/?datasource=tranquility');
      const jumpsAll = await jumpsRes.json();

      const jumpsObj = jumpsAll.find(j => j.system_id === systemId);
      const totalJumps = jumpsObj?.ship_jumps ?? 0;

      const shipKills = killsData.filter(k => {
        const typeId = k.victim?.ship_type_id;
        return typeId && ![670,671,672,673,674,675,676,677,678,679].includes(typeId);
      }).length;

      const podKills = killsData.filter(k => {
        const typeId = k.victim?.ship_type_id;
        return typeId && [670,671,672,673,674,675,676,677,678,679].includes(typeId);
      }).length;

      const npcKills = killsData.filter(k => k.zkb?.npc).length;

      const data = { jumps1h: Math.floor(totalJumps/48), jumps24h: totalJumps, shipKills, podKills, npcKills };

      cache[systemId] = { time: now, data };
      saveKillCache(cache);

      return data;

    } catch(err) {
      console.error(err);
      return { jumps1h: 0, jumps24h: 0, shipKills: 0, podKills: 0, npcKills: 0 };
    }
  }

  async function fetchStations(systemId){
    try {
      const res = await fetch(`https://esi.evetech.net/latest/universe/systems/${systemId}/?datasource=tranquility`);
      const data = await res.json();
      if(!data.stations) return [];

      const stationsFull = await Promise.all(data.stations.map(async stationId => {
        try {
          const sRes = await fetch(`https://esi.evetech.net/latest/universe/stations/${stationId}/?datasource=tranquility`);
          return await sRes.json();
        } catch(e) {
          console.error("Station fetch error", e);
          return { name: "Unknown", owner: "Unknown", type_id: 0, services: [] };
        }
      }));

      return stationsFull.map(s => ({
        name: s.name || "Unknown",
        owner: s.owner ?? "Unknown",
        type: s.type_id ?? "Unknown",
        services: s.services?.join(", ") || "Unknown"
      }));

    } catch(err) {
      console.error(err);
      return [];
    }
  }

  async function runLookup() {
    const name = input.value.trim().toLowerCase();
    if(!name){ return; }
    if(!systemsLoaded){ 
        outputDiv.innerHTML = '<p>Systems data still loading...</p>'; 
        return; 
    }

    updateURL(name);

    const system = systems.find(s => s.system.toLowerCase() === name);
    if(!system){
        outputDiv.innerHTML = `<p>System "${input.value}" not found!</p>`; 
        return;
    }

    outputDiv.innerHTML = `<p>Fetching data for <b>${system.system}</b>...</p>`;

    // Security
    const sec = parseFloat(system.security_status.toFixed(1));
    const cls = secClass(sec);

    // Fetch 48h kills and jumps
    const data = await fetchSystemData(system.system_id);

    // Fetch stations
    const stations = await fetchStations(system.system_id);

    // Generate table
    outputDiv.innerHTML = `
      <div class="system-container">
        <div class="system-info">
          <table id="systemInfoTable">
            <tr><th>Name</th><td>${system.system}</td><th>Planets</th><td>${system.planets || 0}</td></tr>
            <tr><th>Region</th><td>${system.region || "Unknown"}</td><th>Moons</th><td>${system.moons || 0}</td></tr>
            <tr><th>Constellation</th><td>${system.constellation || "Unknown"}</td><th>Belts/Icebelts</th><td>${(system.belts||0)+ (system.icebelts||0)}</td></tr>
            <tr><th>Security Level</th><td>${sec}</td><th>Security Class</th><td>${cls}</td></tr>
            <tr><th>Faction</th><td colspan="3">${system.faction || "None"}</td></tr>
            <tr><th>Jumps 1h / 24h</th><td colspan="3">${data.jumps1h} / ${data.jumps24h}</td></tr>
            <tr><th>Ship Kills</th><td colspan="3">${data.shipKills} / ${data.shipKills}</td></tr>
            <tr><th>NPC Kills</th><td colspan="3">${data.npcKills} / ${data.npcKills}</td></tr>
            <tr><th>Pod Kills</th><td colspan="3">${data.podKills} / ${data.podKills}</td></tr>
            <tr><th>Minerals</th><td colspan="3">Unknown</td></tr>
          </table>

          <h3>Stations</h3>
          <table id="stationsTable">
            <tr><th>Name</th><th>Owner</th><th>Type</th><th>Services</th></tr>
            ${stations.map(s => `<tr>
              <td>${s.name}</td>
              <td>${s.owner}</td>
              <td>${s.type}</td>
              <td>${s.services}</td>
            </tr>`).join('')}
          </table>
        </div>
      </div>
    `;
  }

  function updateURL(systemName){
    const params = new URLSearchParams(window.location.search);
    params.set('system', systemName);
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
  }

})();