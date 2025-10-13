(() => {
  const input = document.querySelector('#systemName');
  const suggestionsDiv = document.getElementById('suggestions');
  const lookupBtn = document.getElementById('lookupBtn');
  const outputDiv = document.getElementById('output');

  let systems = [];
  let systemsLoaded = false;
  let currentFocus = -1;

  // Chart instances
  let jumpsChart, npcKillsChart, shipKillsChart, podKillsChart;

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

  // zKill fetch for 48h
  const past48h = 48*3600; // seconds

  const podTypeIds = [670, 671, 672, 673, 674, 675, 676, 677, 678, 679]; // all capsule types

  async function fetchSystemData(systemId){
    const now = Date.now();
    let cache = loadKillCache();
    if(cache[systemId] && now - cache[systemId].time < CACHE_TTL) return cache[systemId].data;

    try {
      // Fetch kills from zKill
      const res = await fetch(`https://zkillboard.com/api/kills/systemID/${systemId}/pastSeconds/${past48h}/`);
      const killsData = await res.json();

      // Fetch jumps from ESI
      const jumpsRes = await fetch('https://esi.evetech.net/latest/universe/system_jumps/?datasource=tranquility');
      const jumpsAll = await jumpsRes.json();
      const jumpsObj = jumpsAll.find(j=>j.system_id===systemId);
      const totalJumps = jumpsObj?.ship_jumps || 0;

      // Initialize 48h bins
      const jumps = Array(48).fill(0);
      const npc = Array(48).fill(0);
      const ship = Array(48).fill(0);
      const pod = Array(48).fill(0);

      const nowMs = Date.now();

      // Distribute kills into hourly bins
      killsData.forEach(k => {
        const ts = new Date(k.killmail_time).getTime();
        const hourAgo = Math.floor((nowMs - ts)/(1000*3600));
        if(hourAgo < 48){
          const idx = 47 - hourAgo;
          if(k.victim.ship_type_id && podTypeIds.includes(k.victim.ship_type_id)) pod[idx]++;
          else if(k.zkb?.npc) npc[idx]++;
          else ship[idx]++;
        }
      });

      // Distribute jumps evenly into 48h bins (rough estimate)
      const jumpsPerHour = Math.floor(totalJumps / 48);
      for(let i=0;i<48;i++) jumps[i] = jumpsPerHour;

      cache[systemId] = {time: now, data:{jumps,npc,ship,pod}};
      saveKillCache(cache);
      return cache[systemId].data;

    } catch(err) {
      console.error(err);
      return {jumps:Array(48).fill(0), npc:Array(48).fill(0), ship:Array(48).fill(0), pod:Array(48).fill(0)};
    }
  }

  function createLineChart(ctx, label, data, color){
    return new Chart(ctx, {
      type: 'line',
      data: { labels: Array.from({length:48},(_,i)=>i), datasets:[{label,data,borderColor:color,backgroundColor:color+'33',fill:true,tension:0.3}] },
      options:{
        responsive:true,
        plugins:{legend:{display:true}},
        scales:{
          x:{title:{display:true,text:'Hours ago',color:'#ccc'},ticks:{color:'#ccc',callback:function(val,index){
            const hour = 47-index;
            if(hour%8===2 || hour===0) return hour+'h'; return '';
          }}},
          y:{beginAtZero:true,ticks:{color:'#ccc'}}
        }
      }
    });
  }

  async function renderCharts48h(systemId){
    const data = await fetchSystemData(systemId);
    const ctxJ = document.getElementById('jumpsChart');
    const ctxN = document.getElementById('npcKillsChart');
    const ctxS = document.getElementById('shipKillsChart');
    const ctxP = document.getElementById('podKillsChart');

    [jumpsChart,npcKillsChart,shipKillsChart,podKillsChart].forEach(c=>c?.destroy?.());

    jumpsChart = createLineChart(ctxJ,'Jumps Last 48h',data.jumps,'#4bcef4');
    npcKillsChart = createLineChart(ctxN,'NPC Kills Last 48h',data.npc,'#60daa6');
    shipKillsChart = createLineChart(ctxS,'Ship Kills Last 48h',data.ship,'#dc6c09');
    podKillsChart = createLineChart(ctxP,'Pod Kills Last 48h',data.pod,'#bc1116');
  }

  async function runLookup(){
    const name = input.value.trim().toLowerCase();
    if(!name){ return; }
    if(!systemsLoaded){ outputDiv.innerHTML='<p>Systems data still loading...</p>'; return; }

    updateURL(name);
    const system = systems.find(s=>s.system.toLowerCase()===name);
    if(!system){ outputDiv.innerHTML=`<p>System "${input.value}" not found!</p>`; return; }

    outputDiv.innerHTML=`<p>Fetching data for <b>${system.system}</b>...</p>`;

    const sec = parseFloat(system.security_status.toFixed(1)).toFixed(1);
    const cls = secClass(sec);

    outputDiv.innerHTML=`
      <div class="system-info">
        <table id="systemInfoTable">
          <tr><th>Name</th><td>${system.system}</td></tr>
          <tr><th>Constellation</th><td>${system.constellation||'Unknown'}</td></tr>
          <tr><th>Region</th><td>${system.region||'Unknown'}</td></tr>
          <tr><th>Security Status</th><td class="${cls}">${sec}</td></tr>
        </table>
      </div>
      <div class="charts-wrapper" id="graphContainer">
        <canvas id="jumpsChart"></canvas>
        <canvas id="npcKillsChart"></canvas>
        <canvas id="shipKillsChart"></canvas>
        <canvas id="podKillsChart"></canvas>
      </div>
    `;

    renderCharts48h(system.system_id);
  }

  function updateURL(systemName){
    const params = new URLSearchParams(window.location.search);
    params.set('system', systemName);
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
  }

})();