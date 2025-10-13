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
      const res = await fetch(`https://zkillboard.com/api/kills/systemID/${systemId}/pastSeconds/172800/`);
      const killsData = await res.json();

      const jumpsRes = await fetch('https://esi.evetech.net/latest/universe/system_jumps/?datasource=tranquility');
      const jumpsAll = await jumpsRes.json();
      const jumpsObj = jumpsAll.find(j => j.system_id === systemId);
      const totalJumps = jumpsObj?.ship_jumps ?? 0;

      const shipKills = killsData.filter(k => !k.victim.ship_type_id || ![670,671,672,673,674,675,676,677,678,679].includes(k.victim.ship_type_id)).length;
      const podKills = killsData.filter(k => k.victim.ship_type_id && [670,671,672,673,674,675,676,677,678,679].includes(k.victim.ship_type_id)).length;
      const npcKills = killsData.filter(k => k.zkb?.npc).length;

      const result = { jumps1h: Math.floor(totalJumps/48), jumps24h: totalJumps, shipKills, podKills, npcKills };
      cache[systemId] = { data: result, time: now };
      saveKillCache(cache);
      return result;
    } catch(err) {
      console.error(err);
      return { jumps1h:0,jumps24h:0,shipKills:0,podKills:0,npcKills:0 };
    }
  }

  async function fetchESISystem(systemId){
    try {
      const res = await fetch(`https://esi.evetech.net/latest/universe/systems/${systemId}/`);
      if(!res.ok) throw new Error("ESI fetch failed");
      return await res.json();
    } catch(err){
      console.error("Error fetching ESI system:", err);
      return null;
    }
  }

  async function runLookup() {
    const name = input.value.trim().toLowerCase();
    if(!name){ return; }
    if(!systemsLoaded){ outputDiv.innerHTML = '<p>Systems data still loading...</p>'; return; }

    updateURL(name);
    const system = systems.find(s => s.system.toLowerCase() === name);
    if(!system){ outputDiv.innerHTML = `<p>System "${input.value}" not found!</p>`; return; }

    outputDiv.innerHTML = `<p>Fetching data for <b>${system.system}</b>...</p>`;

    const sec = parseFloat(system.security_status.toFixed(1));
    const cls = secClass(sec);

    const data = await fetchSystemData(system.system_id);
    const esiData = await fetchESISystem(system.system_id);

    let planets = 0, moons = 0, belts = 0, stations = [];
    if(esiData){
      planets = esiData.planets?.length || 0;
      moons = esiData.planets?.reduce((sum,p)=>sum + (p.moons?.length||0),0);
      belts = esiData.planets?.reduce((sum,p)=>sum + (p.asteroid_belts?.length||0),0);
      stations = esiData.stations || [];
    }

    const minerals = system.minerals?.join(", ") || "Unknown";

    // Generate system table
    outputDiv.innerHTML = `
      <div class="system-container">
        <table id="systemInfoTable">
          <tr><th>Name</th><td>${system.system}</td><th>Planets</th><td>${planets}</td></tr>
          <tr><th>Region</th><td>${system.region}</td><th>Moons</th><td>${moons}</td></tr>
          <tr><th>Constellation</th><td>${system.constellation}</td><th>Belts/Icebelts</th><td>${belts}</td></tr>
          <tr><th>Security Level</th><td>${sec}</td><th>Security Class</th><td>${cls}</td></tr>
          <tr><th>Faction</th><td colspan="3">None</td></tr>
          <tr><th>Jumps 1h / 24h</th><td colspan="3">${data.jumps1h} / ${data.jumps24h}</td></tr>
          <tr><th>Ship Kills</th><td colspan="3">${data.shipKills} / ${data.shipKills}</td></tr>
          <tr><th>NPC Kills</th><td colspan="3">${data.npcKills} / ${data.npcKills}</td></tr>
          <tr><th>Pod Kills</th><td colspan="3">${data.podKills} / ${data.podKills}</td></tr>
          <tr><th>Minerals</th><td colspan="3">${minerals}</td></tr>
        </table>

        <h3>Stations / Outposts [${stations.length}]</h3>
        <table id="stationsTable">
          <tr>
            <th>Name</th>
            <th>Owner</th>
            <th>Services</th>
            <th>Type</th>
          </tr>
          ${stations.map(s=>`<tr>
            <td>${s.name || s.system_id}</td>
            <td>${s.owner || "Unknown"}</td>
            <td>${s.services || "Unknown"}</td>
            <td>${s.type || "Unknown"}</td>
          </tr>`).join('')}
        </table>
      </div>
    `;
  }

  function updateURL(systemName){
    const params = new URLSearchParams(window.location.search);
    params.set('system', systemName);
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
  }

})();