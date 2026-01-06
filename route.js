// --- CONSTANTS & DATA FILES ---
const DATA_FILES = {
    systems: 'systems.json',
    names: 'names.json'
};

const API_ROUTE_URL = '/api/route';
const EVE_SCOUT_URL = 'https://api.eve-scout.com/v2/public/signatures';

const THERA_ID = 31000005;
const TURNUR_ID = 30002086;
const ZARZAKH_ID = 30100000;

let systemsData = null;
let namesData = null;
let wormholeConnections = [];
let systemStats = {};

let currentRoutes = { direct: null, thera: null };
let avoidList = new Set([ZARZAKH_ID]);

// --- DOM ELEMENTS ---
const startInput = document.getElementById('start-system');
const endInput = document.getElementById('end-system');
const calculateBtn = document.getElementById('calculate-btn');
const startSuggestions = document.getElementById('start-suggestions');
const endSuggestions = document.getElementById('end-suggestions');

const avoidInput = document.getElementById('avoid-system');
const avoidSuggestions = document.getElementById('avoid-suggestions');
const avoidTagsDiv = document.getElementById('avoid-tags');

const systemCountSpan = document.getElementById('system-count');
const connectionStatusSpan = document.getElementById('connection-status');
const directJumpsSpan = document.getElementById('direct-jumps');
const theraJumpsSpan = document.getElementById('thera-jumps');
const routeListDiv = document.getElementById('route-list');

const directCard = document.getElementById('direct-route-card');
const theraCard = document.getElementById('thera-route-card');

const waypointContainer = document.getElementById('waypoint-container');
const addWaypointBtn = document.getElementById('add-waypoint-btn');
const lastUpdateSpan = document.getElementById('last-update');
const totalJumps = document.getElementById('total-jumps');

let lastEveScoutSync = null;
let latestTheraUpdate = null;
let latestTurnurUpdate = null;

// --- INITIALIZATION ---
async function init() {
    try {
        await loadData();
        await fetchEveScoutStatus();
        setupEventListeners();
        checkUrlParams();
        renderAvoidList();
        loadFavorites();

        setInterval(updateSyncDisplay, 60000);
        updateSyncDisplay();
    } catch (e) {
        console.error("Initialization failed:", e);
        alert("Failed to load data. Please check console.");
    }
}

function updateSyncDisplay() {
    if (!lastEveScoutSync) return;
    const now = new Date();

    const formatDiff = (date) => {
        if (!date) return '--';
        const diffMins = Math.floor((now - date) / 60000);
        if (diffMins < 60) return `${diffMins}m`;
        const h = Math.floor(diffMins / 60);
        const m = diffMins % 60;
        return `${h}h ${m}m`;
    };

    const theraAge = formatDiff(latestTheraUpdate);
    const turnurAge = formatDiff(latestTurnurUpdate);
    const totalWH = wormholeConnections.length;

    lastUpdateSpan.innerHTML = `Total WH: ${totalWH} / Thera last update ${theraAge} / Turnur last update ${turnurAge}`;
    lastUpdateSpan.style.opacity = "1";
    lastUpdateSpan.style.fontSize = "0.75rem";
}

// --- LOAD DATA ---
async function loadData() {
    const [systemsRes, namesRes] = await Promise.all([
        fetch(DATA_FILES.systems),
        fetch(DATA_FILES.names)
    ]);

    systemsData = await systemsRes.json();
    namesData = await namesRes.json();
    if (systemCountSpan) systemCountSpan.style.display = 'none';
    if (connectionStatusSpan) connectionStatusSpan.style.display = 'none';
}

// --- FETCH EVE SCOUT DATA ---
async function fetchEveScoutStatus() {
    try {
        const response = await fetch(EVE_SCOUT_URL);
        const data = await response.json();

        lastEveScoutSync = new Date();
        let maxThera = 0;
        let maxTurnur = 0;

        const whs = data.filter(sig => sig.signature_type === 'wormhole' && sig.in_system_id && sig.out_system_id);
        wormholeConnections = whs;

        data.forEach(sig => {
            const upTime = new Date(sig.updated_at).getTime();
            if (sig.in_system_id == THERA_ID || sig.out_system_id == THERA_ID) {
                if (upTime > maxThera) maxThera = upTime;
            }
            if (sig.in_system_id == TURNUR_ID || sig.out_system_id == TURNUR_ID) {
                if (upTime > maxTurnur) maxTurnur = upTime;
            }
        });

        latestTheraUpdate = maxThera > 0 ? new Date(maxThera) : null;
        latestTurnurUpdate = maxTurnur > 0 ? new Date(maxTurnur) : null;
        updateSyncDisplay();
    } catch (e) {
        console.error("Eve-Scout fetch failed:", e);
    }
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    setupAutocomplete(startInput, startSuggestions);
    setupAutocomplete(endInput, endSuggestions);
    setupAutocomplete(avoidInput, avoidSuggestions, (name) => {
        addSystemToAvoidList(name);
        avoidInput.value = '';
    });

    calculateBtn.addEventListener('click', () => calculateRoutes(true));

    directCard.addEventListener('click', () => {
        if (currentRoutes.direct) {
            renderRouteList(currentRoutes.direct, 'Direct Route');
            directCard.classList.add('selected');
            theraCard.classList.remove('selected');
        }
    });

    theraCard.addEventListener('click', () => {
        if (currentRoutes.thera) {
            renderRouteList(currentRoutes.thera, 'Thera Route');
            theraCard.classList.add('selected');
            directCard.classList.remove('selected');
        }
    });

    addWaypointBtn.addEventListener('click', () => addWaypoint());
}

// --- WAYPOINTS ---
function addWaypoint(name = '') {
    const div = document.createElement('div');
    div.className = 'waypoint-item';
    const inputId = `waypoint-${Date.now()}`;
    const suggId = `suggestions-${Date.now()}`;

    div.innerHTML = `
        <div class="input-group">
            <label>Waypoint</label>
            <input type="text" id="${inputId}" value="${name}" placeholder="System name..." autocomplete="off">
            <div id="${suggId}" class="suggestions"></div>
        </div>
        <button class="remove-waypoint-btn" title="Remove">×</button>
    `;

    waypointContainer.appendChild(div);
    const input = div.querySelector('input');
    const sugg = div.querySelector('.suggestions');
    const delBtn = div.querySelector('.remove-waypoint-btn');

    setupAutocomplete(input, sugg, null);

    delBtn.onclick = () => {
        div.remove();
        calculateRoutes();
    };
    input.onchange = () => calculateRoutes();
}

// --- AVOID LIST ---
function addSystemToAvoidList(name) {
    const id = namesData[findCorrectCase(name)];
    if (id && !avoidList.has(id)) {
        avoidList.add(id);
        renderAvoidList();
        if (startInput.value && endInput.value) calculateRoutes(true);
    }
}

function removeSystemFromAvoidList(id) {
    if (avoidList.delete(id)) {
        renderAvoidList();
        if (startInput.value && endInput.value) calculateRoutes(true);
    }
}

function renderAvoidList() {
    avoidTagsDiv.innerHTML = '';
    avoidList.forEach(id => {
        const sys = systemsData[id] || { name: 'Unknown' };
        const tag = document.createElement('div');
        tag.className = 'avoid-tag';
        tag.textContent = `${sys.name} ✖`;
        tag.addEventListener('click', () => removeSystemFromAvoidList(id));
        avoidTagsDiv.appendChild(tag);
    });
}

// --- URL PARAMS ---
function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const start = params.get('start');
    const end = params.get('end');
    const wps = params.get('wps');
    const avoid = params.get('avoid');
    const pref = params.get('pref');

    if (avoid) avoid.split(',').forEach(name => { const id = namesData[findCorrectCase(name.trim())]; if (id) avoidList.add(id); });
    if (wps) wps.split(',').forEach(name => addWaypoint(name.trim()));
    if (pref === 'safest') { const radio = document.querySelector('input[name="preference"][value="safest"]'); if (radio) radio.checked = true; }

    if (start) startInput.value = start;
    if (end) endInput.value = end;

    if (start && end) setTimeout(() => calculateRoutes(false), 500);
}

// --- URL STATE ---
function updateUrlState(startName, endName) {
    const avoidArray = Array.from(avoidList).map(id => systemsData[id]?.name || id);
    const wpInputs = Array.from(waypointContainer.querySelectorAll('input'));
    const wps = wpInputs.map(inp => inp.value.trim()).filter(v => !!v);
    const prefEl = document.querySelector('input[name="preference"]:checked');
    const weightMode = prefEl ? prefEl.value : 'shortest';

    const params = new URLSearchParams();
    params.set('start', startName);
    params.set('end', endName);
    if (wps.length) params.set('wps', wps.join(','));
    if (avoidArray.length) params.set('avoid', avoidArray.join(','));
    if (weightMode === 'safest') params.set('pref', 'safest');

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
}

// --- GRAPH & PATHFINDING ---
let whGraph = {};
function buildGraph() {
    whGraph = {};
    Object.values(systemsData).forEach(sys => {
        if (!whGraph[sys.id]) whGraph[sys.id] = [];
        if (sys.stargates) sys.stargates.forEach(to => whGraph[sys.id].push(to));
    });
}

async function addWormholes() {
    const thera = await fetch("https://api.eve-scout.com/v2/public/signatures?system_name=thera").then(r => r.json());
    const turnur = await fetch("https://api.eve-scout.com/v2/public/signatures?system_name=turnur").then(r => r.json());
    [...thera, ...turnur].forEach(sig => {
        if (sig.signature_type === "wormhole" && sig.completed && sig.remaining_hours > 1) {
            const from = sig.out_system_id;
            const to = sig.in_system_id;
            if (!whGraph[from]) whGraph[from] = [];
            if (!whGraph[to]) whGraph[to] = [];
            whGraph[from].push(to);
            whGraph[to].push(from);
        }
    });
}

function shortestPath(startId, endId) {
    const queue = [[startId]];
    const visited = new Set();
    while (queue.length) {
        const path = queue.shift();
        const node = path[path.length - 1];
        if (node === endId) return path;
        if (!visited.has(node)) {
            visited.add(node);
            (whGraph[node] || []).forEach(n => queue.push([...path, n]));
        }
    }
    return null;
}

// --- PVPKILLS (zKill sequential) ---
let killCache = JSON.parse(localStorage.getItem("killCache") || "{}");
const CACHE_TTL = 60 * 60 * 1000;
function saveCache() { localStorage.setItem("killCache", JSON.stringify(killCache)); }

async function getPvpKills(systemId, retries = 3, delay = 1000) {
    const now = Date.now();
    if (killCache[systemId] && now - killCache[systemId].time < CACHE_TTL) return killCache[systemId].kills;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(`https://zkillboard.com/api/kills/systemID/${systemId}/pastSeconds/3600/`, {
                headers: { "Accept-Encoding": "gzip", "User-Agent": "eve_app" }
            });
            if (!res.ok) await sleep(delay * attempt);
            const kills = await res.json();
            if (!Array.isArray(kills)) return 0;
            const pvpKills = kills.filter(k => k.zkb && !k.zkb.npc).length;
            killCache[systemId] = { time: now, kills: pvpKills };
            saveCache();
            return pvpKills;
        } catch { await sleep(delay * attempt); }
    }
    return 0;
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function getRouteKills(route) {
    const result = {};
    for (let id of route) result[id] = await getPvpKills(id);
    return result;
}

// --- AUTOCOMPLETE ---
function setupAutocomplete(input, suggestionBox, callback = null) {
    let currentFocus = -1;

    if (!suggestionBox) return;

    input.addEventListener("input", () => {
        const value = input.value.trim().toLowerCase();
        suggestionBox.innerHTML = '';
        suggestionBox.style.display = 'none';
        currentFocus = -1;

        if (value.length < 2) return;

        const matches = Object.keys(namesData)
            .filter(name => name.toLowerCase().startsWith(value))
            .slice(0, 10);

        if (matches.length) {
            matches.forEach((name, index) => {
                const div = document.createElement('div');
                div.textContent = name;
                div.setAttribute('data-index', index);
                div.addEventListener('click', () => {
                    if (callback) callback(name);
                    else input.value = name;
                    suggestionBox.style.display = 'none';
                    currentFocus = -1;
                });
                suggestionBox.appendChild(div);
            });
            suggestionBox.style.display = 'block';
        }
    });

    input.addEventListener("keydown", e => {
        const items = suggestionBox.querySelectorAll('div');
        if (suggestionBox.style.display === 'none' || !items.length) return;

        if (e.key === "ArrowDown") { currentFocus++; addActive(items); e.preventDefault(); }
        else if (e.key === "ArrowUp") { currentFocus--; addActive(items); e.preventDefault(); }
        else if (e.key === "Enter") { e.preventDefault(); if (currentFocus > -1 && items[currentFocus]) items[currentFocus].click(); }
        else if (e.key === "Escape") suggestionBox.style.display = 'none';

        function addActive(items) { items.forEach(el => el.classList.remove('autocomplete-active')); if (currentFocus >= items.length) currentFocus = 0; if (currentFocus < 0) currentFocus = items.length - 1; items[currentFocus].classList.add('autocomplete-active'); items[currentFocus].scrollIntoView({ block: 'nearest' }); }
    });

    document.addEventListener("click", e => { if (e.target !== input && e.target !== suggestionBox) suggestionBox.style.display = 'none'; });
}

function findCorrectCase(inputName) { if (!inputName) return null; if (namesData[inputName]) return inputName; return Object.keys(namesData).find(n => n.toLowerCase() === inputName.toLowerCase()); }

// --- ROUTE CALCULATION & DISPLAY ---
async function calculateRoutes(updateUrl = true) {
    const startName = startInput.value.trim();
    const endName = endInput.value.trim();
    if (!startName || !endName) return;

    const startId = namesData[findCorrectCase(startName)];
    const endId = namesData[findCorrectCase(endName)];
    if (!startId || !endId) { routeListDiv.innerHTML = "<p>Origin or destination system not found!</p>"; return; }

    // Waypoints
    const wpInputs = Array.from(waypointContainer.querySelectorAll('input'));
    const waypointIds = wpInputs.map(inp => namesData[findCorrectCase(inp.value.trim())]).filter(v => !!v);

    // Avoid
    const avoidArray = Array.from(avoidList);

    if (updateUrl) updateUrlState(startName, endName);

    routeListDiv.innerHTML = "<p>Calculating route...</p>";

    try {
        buildGraph();
        await addWormholes();

        const fullPathIds = [startId, ...waypointIds, endId];
        let mergedRouteIds = [];
        for (let i = 0; i < fullPathIds.length - 1; i++) {
            const subPath = shortestPath(fullPathIds[i], fullPathIds[i + 1]);
            if (!subPath) throw new Error(`No route found between ${systemsData[fullPathIds[i]].name} and ${systemsData[fullPathIds[i+1]].name}`);
            if (mergedRouteIds.length) subPath.shift();
            mergedRouteIds.push(...subPath);
        }

        const routeKills = await getRouteKills(mergedRouteIds);

        // Render table
        let html = `<table class="route-table"><tr><th>Jump</th><th>System</th><th>Security</th><th>Kills (1h)</th><th>zKill</th></tr>`;
        mergedRouteIds.forEach((sysId, idx) => {
            const system = systemsData[sysId] || { name: "Unknown", security: 0 };
            const sec = parseFloat(system.security || 0).toFixed(1);
            const cls = getSecClass(sec);
            const kills = routeKills[sysId] || 0;
            const killClass = kills >= 5 ? "kills-high" : (kills > 0 ? "kills-medium" : "");
            const highlight = (system.name === "Thera" || system.name === "Turnur") ? 'highlight-system' : '';
            html += `<tr class="${highlight}"><td>${idx}</td><td>${system.name}</td><td class="${cls}">${sec}</td><td class="${killClass}">${kills}</td><td><a href="https://zkillboard.com/system/${sysId}/" target="_blank">zKillboard</a></td></tr>`;
        });
        html += "</table>";
        totalJumps.textContent = `Total Jumps: ${mergedRouteIds.length - 1}`;
        routeListDiv.innerHTML = html;

        // Save current
        currentRoutes.direct = mergedRouteIds;
        directCard.classList.add('selected');
        theraCard.classList.remove('selected');

    } catch (err) {
        console.error(err);
        routeListDiv.innerHTML = `<p>Error calculating route: ${err.message}</p>`;
    }
}

// --- UTILS ---
function getSecClass(sec) { return sec >= 0.5 ? 'high-sec' : sec >= 0.0 ? 'low-sec' : 'null-sec'; }

// --- FAVORITES ---
function loadFavorites() {
    const favs = JSON.parse(localStorage.getItem('favorites') || "[]");
    favs.forEach(name => addWaypoint(name));
}

// --- INIT ---
init();
