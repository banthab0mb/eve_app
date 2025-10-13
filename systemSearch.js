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
      // zKillboard kills
      const res = await fetch(`https://zkillboard.com/api/kills/systemID/${systemId}/pastSeconds/172800/`);
      const killsData = await res.json();

      const shipKills = killsData.filter(k => k.victim?.ship_type_id && k.victim.ship_type_id !== null && k.victim.ship_type_id !== 0 && k.victim.ship_type_id !== undefined && k.victim.ship_type_id_category !== 6).length;

      const podKills = killsData.filter(k => k.victim?.ship_type_id && k.victim.ship_type_id_category === 6).length; // 6 = Capsule

      const npcKills = killsData.filter(k => k.zkb?.npc).length;

      const jumpsRes = await fetch('https://esi.evetech.net/latest/universe/system_jumps/?datasource=tranquility');
      const jumpsAll = await jumpsRes.json();
      const jumpsObj = jumpsAll.find(j => j.system_id === systemId);
      const totalJumps = jumpsObj?.ship_jumps ?? 0;

      const data = { jumps1h: Math.floor(totalJumps/48), jumps24h: totalJumps, shipKills, podKills, npcKills };
      cache[systemId] = { time: now, data };
      saveKillCache(cache);

      return data;

    } catch(err){
      console.error(err);
      return { jumps1h:0, jumps24h:0, shipKills:0, podKills:0, npcKills:0 };
    }
  }

  async function fetchSystemDetails(systemId){
    try {
      const res = await fetch(`https://esi.evetech.net/latest/universe/systems/${systemId}/?datasource=tranquility`);
      return await res.json();
    } catch(e){
      console.error(e);
      return {};
    }
  }

  async function fetchFaction(factionId){
    if(!factionId) return "None";
    try{
      const res = await fetch(`https://esi.evetech.net/latest/universe/factions/${factionId}/?datasource=tranquility`);
      const f = await res.json();
      return f.name ?? "Unknown";
    }catch{
      return "Unknown";
    }
  }

  async function fetchCorporation(corpId){
    if(!corpId) return "Unknown";
    try{
      const res = await fetch(`https://esi.evetech.net/latest/corporations/${corpId}/?datasource=tranquility`);
      const c = await res.json();
      return c.name ?? "Unknown";
    }catch{
      return "Unknown";
    }
  }

  async function fetchStations(systemId){
    try {
      const res = await fetch(`https://esi.evetech.net/latest/universe/systems/${systemId}/?datasource=tranquility`);
      const data = await res.json();
      if(!data.stations) return [];

      const stationsFull = await Promise.all(data.stations.map(async id => {
        try {
          const sRes = await fetch(`https://esi.evetech.net/latest/universe/stations/${id}/?datasource=tranquility`);
          const sData = await sRes.json();
          const ownerName = await fetchCorporation(sData.owner);

          // type_id from the ESI response
          let typeName = "Unknown";
          switch(sData.type_id){
            case 3: typeName = "Outpost"; break;
            case 4: typeName = "Starbase"; break;
            case 5: typeName = "Citadel"; break;
            case 6: typeName = "Engineering Complex"; break;
            case 7: typeName = "Refinery"; break;
            case 8: typeName = "Assembly Plant"; break;
            case 9: typeName = "Trade Hub"; break;
            case 10: typeName = "Moon Mining Facility"; break;
            default: typeName = `Type ${sData.type_id}`; break;
          }

          return {
            name: sData.name ?? "Unknown",
            owner: ownerName,
            type: typeName,
            services: sData.services?.join(", ") ?? "None"
          };
        } catch(e){
          console.error("Station fetch error", e);
          return { name:"Unknown", owner:"Unknown", type:"Unknown", services:"None" };
        }
      }));

      return stationsFull;
    } catch(err){
      console.error(err);
      return [];
    }
  }

  async function runLookup(){
    const name = input.value.trim().toLowerCase();
    if(!name) return;
    if(!systemsLoaded){ outputDiv.innerHTML = '<p>Systems data still loading...</p>'; return; }

    updateURL(name);

    const systemObj = systems.find(s => s.system.toLowerCase() === name);
    if(!systemObj){ outputDiv.innerHTML = `<p>System "${input.value}" not found!</p>`; return; }

    outputDiv.innerHTML = `<p>Fetching data for <b>${systemObj.system}</b>...</p>`;

    const sysDetails = await fetchSystemDetails(systemObj.system_id);
    const sec = parseFloat(sysDetails.security_status ?? 0);
    const secCls = secClass(sec);
    const factionName = await fetchFaction(sysDetails.faction_id);

    const data = await fetchSystemData(systemObj.system_id);
    const stations = await fetchStations(systemObj.system_id);

    const planets = sysDetails.planets?.length ?? 0;
    const moons = sysDetails.moons?.length ?? 0;
    const belts = sysDetails.asteroid_belts?.length ?? 0;

    outputDiv.innerHTML = `
      <div class="system-container">
        <div class="system-info">
          <table id="systemInfoTable">
            <tr><th>Name</th><td>${sysDetails.name}</td><th>Planets</th><td>${planets}</td></tr>
            <tr><th>Region</th><td>${systemObj.region}</td><th>Moons</th><td>${moons}</td></tr>
            <tr><th>Constellation</th><td>${systemObj.constellation}</td><th>Belts/Icebelts</th><td>${belts}</td></tr>
            <tr><th>Security Level</th><td class="${secCls}">${sec.toFixed(1)}</td><th>Faction</th><td colspan="3">${factionName}</td></tr>
            <tr><th>Jumps 1h</th><td colspan="3">${data.jumps1h}</td></tr>
            <tr><th>Ship Kills</th><td colspan="3">${data.shipKills}</td></tr>
            <tr><th>NPC Kills</th><td colspan="3">${data.npcKills}</td></tr>
            <tr><th>Pod Kills</th><td colspan="3">${data.podKills}</td></tr>
          </table>

          <h3>Stations</h3>
          <table id="stationsTable">
            <tr><th>Name</th><th>Owner</th><th>Type</th><th>Services</th></tr>
            ${stations.map(s => `<tr>
              <td>${s.name}</td>
              <td>${s.owner}</td>
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