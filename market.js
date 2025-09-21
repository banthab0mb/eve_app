/* market.js - full behavior: suggestions, all-regions, buy/sell, history, safe DOM checks */

let historyChartInstance = null;
let itemsList = [];
let regionsList = [];
const stationCache = new Map();

document.addEventListener('DOMContentLoaded', () => {
  initUI();
  loadRegions();
  loadItems();
  startEveTime();
  fetchPlayerCount();
});

function initUI() {
  // elements
  const itemInput = document.getElementById('itemInput');
  const suggestions = document.getElementById('suggestions');
  const searchBtn = document.getElementById('searchBtn');
  const tabBtns = document.querySelectorAll('.tab-btn');

  // suggestions handling
  itemInput.addEventListener('input', onItemInput);
  itemInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hideSuggestions(); }
    if (e.key === 'Enter') { e.preventDefault(); performSearch(); hideSuggestions(); }
  });

  document.addEventListener('click', (e) => {
    if (!document.getElementById('itemInput')) return;
    if (!suggestions.contains(e.target) && e.target !== itemInput) {
      hideSuggestions();
    }
  });

  searchBtn.addEventListener('click', () => { performSearch(); });

  // tabs
  tabBtns.forEach(b => {
    b.addEventListener('click', (ev) => {
      document.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
      ev.currentTarget.classList.add('active');
      const tab = ev.currentTarget.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      const el = document.getElementById(tab);
      if (el) el.classList.add('active');
    });
  });

  // CCP disclaimer toggle
  const ccpLink = document.getElementById('ccp-link');
  if (ccpLink) {
    ccpLink.addEventListener('click', (e) => {
      e.preventDefault();
      const disc = document.getElementById('ccp-disclaimer');
      if (disc) disc.style.display = disc.style.display === 'none' || !disc.style.display ? 'block' : 'none';
    });
  }
}

/* ---- Data loaders ---- */
async function loadItems() {
  try {
    const res = await fetch('items.json');
    itemsList = await res.json();
    console.log('Loaded items.json', itemsList.length);
  } catch (err) {
    console.warn('Failed to load items.json', err);
    itemsList = [];
  }
}

async function loadRegions() {
  try {
    const res = await fetch('regions.json');
    regionsList = await res.json();
  } catch (err) {
    console.warn('Failed to load regions.json', err);
    regionsList = [];
  }

  const regionSelect = document.getElementById('regionSelect');
  if (!regionSelect) return;

  // Clear then add "All Regions" then sorted list
  regionSelect.innerHTML = '';
  const all = document.createElement('option');
  all.value = 'all';
  all.textContent = 'All Regions';
  regionSelect.appendChild(all);

  regionsList.sort((a,b) => (a.name||'').localeCompare(b.name||'')).forEach(r => {
    const o = document.createElement('option');
    o.value = String(r.region_id);
    o.textContent = r.name;
    regionSelect.appendChild(o);
  });

  // default keep All Regions selected
  regionSelect.value = 'all';
}

/* ---- Suggestions ---- */
function onItemInput(e) {
  const q = e.target.value.trim().toLowerCase();
  const suggestions = document.getElementById('suggestions');
  if (!suggestions) return;
  if (!q) { suggestions.style.display = 'none'; suggestions.innerHTML = ''; return; }

  const matches = itemsList
    .filter(it => it.name.toLowerCase().includes(q))
    .slice(0, 12);

  suggestions.innerHTML = '';
  matches.forEach(it => {
    const div = document.createElement('div');
    div.textContent = it.name;
    div.addEventListener('click', () => {
      const input = document.getElementById('itemInput');
      input.value = it.name;
      hideSuggestions();
      // optional: trigger search immediately on click
      // performSearch();
    });
    suggestions.appendChild(div);
  });

  if (matches.length) {
    // position suggestions under input
    const inputRect = document.getElementById('itemInput').getBoundingClientRect();
    suggestions.style.display = 'block';
    suggestions.style.left = inputRect.left + 'px';
    suggestions.style.top = (inputRect.bottom + window.scrollY) + 'px';
    suggestions.style.width = (inputRect.width) + 'px';
    suggestions.setAttribute('aria-hidden', 'false');
  } else {
    suggestions.style.display = 'none';
  }
}

function hideSuggestions() {
  const suggestions = document.getElementById('suggestions');
  if (suggestions) { suggestions.style.display = 'none'; suggestions.innerHTML = ''; suggestions.setAttribute('aria-hidden','true'); }
}

/* ---- ESI helpers ---- */
async function getItemId(name) {
  // tolerant parsing of ESI universe/ids result
  try {
    const res = await fetch('https://esi.evetech.net/latest/universe/ids/?datasource=tranquility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([name])
    });
    if (!res.ok) return null;
    const data = await res.json();
    // possible keys: inventory_types, types, type_ids, type
    if (Array.isArray(data.inventory_types) && data.inventory_types.length) return data.inventory_types[0].id;
    if (Array.isArray(data.types) && data.types.length) return data.types[0].id;
    // search for first object with id
    for (const k in data) {
      if (Array.isArray(data[k]) && data[k].length && data[k][0] && typeof data[k][0].id === 'number') return data[k][0].id;
    }
    return null;
  } catch (err) {
    console.warn('getItemId error', err);
    return null;
  }
}

async function fetchOrders(typeId, regionId, orderType) {
  if (!typeId) return [];
  // fetch for a single region
  if (regionId && regionId !== 'all') {
    try {
      const res = await fetch(`https://esi.evetech.net/latest/markets/${regionId}/orders/?order_type=${orderType}&type_id=${typeId}&datasource=tranquility`);
      if (!res.ok) return [];
      const orders = await res.json();
      return orders;
    } catch (err) {
      return [];
    }
  }

  // all regions: parallel-ish (map -> Promise.all)
  const regionIds = regionsList.map(r => r.region_id).filter(Boolean);
  const allResults = await Promise.all(regionIds.map(async rid => {
    try {
      const r = await fetch(`https://esi.evetech.net/latest/markets/${rid}/orders/?order_type=${orderType}&type_id=${typeId}&datasource=tranquility`);
      if (!r.ok) return [];
      const arr = await r.json();
      // annotate region name if available
      const region = regionsList.find(x => String(x.region_id) === String(rid));
      return arr.map(o => ({ ...o, regionName: region ? region.name : undefined }));
    } catch (e) {
      return [];
    }
  }));

  return allResults.flat();
}

async function getStationName(id) {
  if (!id) return 'Unknown';
  if (stationCache.has(id)) return stationCache.get(id);
  try {
    if (id < 1e9) {
      const res = await fetch(`https://esi.evetech.net/latest/universe/stations/${id}/?datasource=tranquility`);
      if (!res.ok) { stationCache.set(id, String(id)); return String(id); }
      const data = await res.json();
      stationCache.set(id, data.name || String(id));
      return data.name || String(id);
    } else {
      const s = `Structure ${id}`;
      stationCache.set(id, s);
      return s;
    }
  } catch (err) {
    stationCache.set(id, String(id));
    return String(id);
  }
}

/* ---- Render ---- */
function clearTable(tbodyId) {
  const t = document.getElementById(tbodyId);
  if (t) t.innerHTML = '';
}

async function renderOrders(orders, tbodyId, limit = 20, orderType = 'sell') {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!Array.isArray(orders) || orders.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="4" class="muted small">No orders found</td>`;
    tbody.appendChild(tr);
    return;
  }

  // sort: sells ascending price, buys descending
  orders.sort((a,b) => orderType === 'sell' ? a.price - b.price : b.price - a.price);
  const limited = orders.slice(0, limit);

  for (const o of limited) {
    const loc = o.regionName || await getStationName(o.location_id);
    const expires = o.duration ? `${o.duration}d` : '-';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${Number(o.price).toLocaleString()}</td>
      <td>${o.volume_remain}</td>
      <td title="${loc}">${loc}</td>
      <td>${expires}</td>
    `;
    tbody.appendChild(tr);
  }
}

/* history chart */
async function renderHistoryChart(typeId, regionId) {
  const canvas = document.getElementById('historyChart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (historyChartInstance) { historyChartInstance.destroy(); historyChartInstance = null; }

  let historyData = [];
  try {
    if (regionId === 'all') {
      // average across regions (simple approach)
      const regionIds = regionsList.map(r => r.region_id);
      const allHist = await Promise.all(regionIds.map(async rid => {
        try {
          const res = await fetch(`https://esi.evetech.net/latest/markets/${rid}/history/?type_id=${typeId}&datasource=tranquility`);
          if (!res.ok) return [];
          return await res.json();
        } catch (e) { return []; }
      }));

      // merge by date
      const map = {};
      allHist.flat().forEach(entry => {
        if (!entry || !entry.date) return;
        map[entry.date] = map[entry.date] || [];
        map[entry.date].push(entry.average || 0);
      });
      historyData = Object.keys(map).sort().map(d => ({ date: d, average: map[d].reduce((a,b)=>a+b,0)/map[d].length }));
    } else {
      const res = await fetch(`https://esi.evetech.net/latest/markets/${regionId}/history/?type_id=${typeId}&datasource=tranquility`);
      historyData = res.ok ? await res.json() : [];
    }
  } catch (err) {
    historyData = [];
  }

  const labels = historyData.map(h => h.date);
  const prices = historyData.map(h => h.average);

  historyChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Average Price',
        data: prices,
        borderColor: '#378937',
        backgroundColor: 'rgba(55,137,55,0.18)',
        fill: true,
        tension: 0.2
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

/* ---- Search orchestration ---- */
async function performSearch() {
  const input = document.getElementById('itemInput');
  const regionSelect = document.getElementById('regionSelect');
  const orderTypeSelect = document.getElementById('orderTypeSelect');

  if (!input) return;
  const itemName = input.value.trim();
  if (!itemName) return;

  const regionId = regionSelect ? regionSelect.value : 'all';
  const orderFilter = orderTypeSelect ? orderTypeSelect.value : 'both';

  // UI: disable while fetching
  const btn = document.getElementById('searchBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Searching...'; }

  try {
    const typeId = await getItemId(itemName);
    if (!typeId) {
      alert('Item not found.');
      return;
    }

    // header + image
    const itemNameEl = document.getElementById('itemName');
    const imgEl = document.getElementById('itemImage');
    if (itemNameEl) itemNameEl.textContent = itemName;
    if (imgEl) {
      imgEl.src = `https://images.evetech.net/types/${typeId}/icon`;
      imgEl.alt = itemName;
    }

    // fetch orders
    const buys = (orderFilter === 'buy' || orderFilter === 'both') ? await fetchOrders(typeId, regionId, 'buy') : [];
    const sells = (orderFilter === 'sell' || orderFilter === 'both') ? await fetchOrders(typeId, regionId, 'sell') : [];

    // render into tables with limit ~20 but visible 8 rows via CSS
    await renderOrders(buys, 'buyOrdersBody', 40, 'buy');
    await renderOrders(sells, 'sellOrdersBody', 40, 'sell');

    // render history into chart (show history tab when user clicks)
    await renderHistoryChart(typeId, regionId);
  } catch (err) {
    console.error('Search failed', err);
    alert('Search failed — check console for details.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Search'; }
  }
}

/* ---- small utilities ---- */
function startEveTime() {
  const el = document.getElementById('eveTime');
  if (!el) return;
  function tick() {
    const now = new Date();
    const hh = String(now.getUTCHours()).padStart(2,'0');
    const mm = String(now.getUTCMinutes()).padStart(2,'0');
    el.textContent = `${hh}:${mm} UTC`;
  }
  tick();
  setInterval(tick, 1000 * 30);
}

async function fetchPlayerCount() {
  const el = document.getElementById('onlineCounter');
  if (!el) return;
  try {
    const res = await fetch('https://esi.evetech.net/latest/status/');
    if (!res.ok) throw new Error('nope');
    const data = await res.json();
    if (typeof data.players === 'number') {
      el.textContent = data.players.toLocaleString();
      el.style.color = '#378937';
    } else {
      el.textContent = 'Tranquility';
    }
  } catch {
    el.textContent = 'Tranquility unreachable';
    el.style.color = '#9f3232';
  }
}