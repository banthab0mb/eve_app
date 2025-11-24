let itemsList = [];
let regionsList = [];
const stationCache = new Map();
let historyChart = null;

const PLEX_ID = 44992;
const PLEX_MARKET_REGION_ID = 19000001; 

document.addEventListener('DOMContentLoaded', () => {
  initElements();
  loadRegions();
  loadItems();
  makeTableSortable('buyOrdersBody');
  makeTableSortable('sellOrdersBody');
});

function $(id) { return document.getElementById(id); }

function initElements() {
  const itemInput = $('itemInput');
  const suggestions = $('suggestions');
  const searchBtn = $('searchBtn');

  // suggestions: live from itemsList
  itemInput.addEventListener('input', (e) => {
    showSuggestions(e.target.value.trim());
  });

  // keyboard: Enter -> search, Esc -> close suggestions
  itemInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); performSearch(); hideSuggestions(); }
    if (e.key === 'Escape') hideSuggestions();
  });

  // click outside to hide suggestions
  document.addEventListener('click', (ev) => {
    const s = $('suggestions');
    if (!s) return;
    if (!s.contains(ev.target) && ev.target !== $('itemInput')) hideSuggestions();
  });

  // search button
  if (searchBtn) searchBtn.addEventListener('click', () => { performSearch(); });

  // tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      ev.currentTarget.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
      const tabId = ev.currentTarget.dataset.tab;
      const target = $(tabId);
      if (target) target.classList.add('active');
    });
  });

  // CCP disclaimer toggle
  const ccpLink = $('ccp-link');
  if (ccpLink) ccpLink.addEventListener('click', (e) => {
    e.preventDefault();
    const disc = $('ccp-disclaimer');
    if (!disc) return;
    disc.style.display = disc.style.display === 'block' ? 'none' : 'block';
  });
}

//Load static files
async function loadItems() {
  try {
    // Using items.json
    const res = await fetch('items.json');
    if (!res.ok) throw new Error('items.json not found');
    itemsList = await res.json();
    console.log(`Loaded items.json (${itemsList.length})`);
  } catch (err) {
    console.warn('Could not load items.json:', err);
    itemsList = [];
  }
}

async function loadRegions() {
  try {
    const res = await fetch('regions.json');
    if (!res.ok) throw new Error('regions.json not found');
    regionsList = await res.json();
    regionsList.sort((a,b) => (a.name||'').localeCompare(b.name||''));
  } catch (err) {
    console.warn('Could not load regions.json:', err);
    regionsList = [];
  }

  const regionSelect = $('regionSelect');
  if (!regionSelect) return;
  regionSelect.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = 'All Regions';
  regionSelect.appendChild(allOpt);

  regionsList.forEach(r => {
    const opt = document.createElement('option');
    opt.value = String(r.region_id);
    opt.textContent = r.name;
    regionSelect.appendChild(opt);
  });
    
    // Add the PLEX Market region to the list for completeness, but it's not a standard market - KEEPING THIS
    const plexMarketRegion = { region_id: PLEX_MARKET_REGION_ID, name: "PLEX Market" };
    // Only add if it's not already in the list
    if (!regionsList.some(r => r.region_id === PLEX_MARKET_REGION_ID)) {
        regionsList.push(plexMarketRegion);
    }
    // Add to select if not present
    if (!regionSelect.querySelector(`option[value="${PLEX_MARKET_REGION_ID}"]`)) {
        const plexOpt = document.createElement('option');
        plexOpt.value = String(PLEX_MARKET_REGION_ID);
        plexOpt.textContent = plexMarketRegion.name;
        regionSelect.appendChild(plexOpt);
    }

  regionSelect.value = 'all';
}

// Suggestions UI
function showSuggestions(query) {
  const box = $('suggestions');
  const input = $('itemInput');
  if (!box || !input) return;

  const q = (query || '').toLowerCase();
  if (!q) { box.style.display = 'none'; box.innerHTML = ''; return; }

  const matches = itemsList
    .filter(it => it.name && it.name.toLowerCase().includes(q))
    .slice(0, 12);

  box.innerHTML = '';
  matches.forEach(it => {
    const div = document.createElement('div');
    div.textContent = it.name;
    div.addEventListener('click', async () => {
      input.value = it.name;
      hideSuggestions();
      await performSearch(); // search immediately on click
    });
    box.appendChild(div);
  });

  if (matches.length) {
    // position inside sidebar (CSS already handles left/right)
    box.style.display = 'block';
    box.setAttribute('aria-hidden', 'false');
  } else {
    box.style.display = 'none';
  }
}

function hideSuggestions() {
  const box = $('suggestions');
  if (!box) return;
  box.style.display = 'none';
  box.innerHTML = '';
  box.setAttribute('aria-hidden', 'true');
}

// ESI helpers
async function getItemId(name) {
  if (!name) return null;
  // Try local items.json first (case-insensitive exact match)
  const found = itemsList.find(i => i.name && i.name.toLowerCase() === name.toLowerCase());
  if (found && found.id) return found.id;

  // fallback to ESI universe/ids lookup
  try {
    const res = await fetch('https://esi.evetech.net/latest/universe/ids/?datasource=tranquility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([name])
    });
    if (!res.ok) return null;
    const data = await res.json();
    // support various response shapes
    if (Array.isArray(data.inventory_types) && data.inventory_types.length) return data.inventory_types[0].id;
    if (Array.isArray(data.types) && data.types.length) return data.types[0].id;
    // search arrays for id
    for (const k of Object.keys(data || {})) {
      if (Array.isArray(data[k]) && data[k].length && data[k][0] && typeof data[k][0].id === 'number') {
        return data[k][0].id;
      }
    }
    return null;
  } catch (err) {
    console.warn('getItemId error', err);
    return null;
  }
}

// Removed fetchOrdersForRegion

async function fetchOrders(typeId, regionId, orderType) {
  if (!typeId) return [];

  // 1. Determine the list of regions to query
  let regionsToQuery = [];
  const isPLEX = typeId === PLEX_ID;
  
  if (isPLEX) {
    // If PLEX, only query the dedicated PLEX Market Region
    regionsToQuery = [PLEX_MARKET_REGION_ID]; // KEEPING PLEX OVERRIDE
  } else if (regionId && regionId !== 'all') {
    // If a specific non-PLEX region is selected
    regionsToQuery = [Number(regionId)];
  } else {
    // If "All Regions" is selected for a non-PLEX item
    regionsToQuery = regionsList.map(r => r.region_id).filter(Boolean);
  }
  
  const results = [];
  
  // 2. Execute the fetch without batching or throttling
  // Reverting to a simple Promise.all
  const promises = regionsToQuery.map(async rid => {
    try {
      const res = await fetch(`https://esi.evetech.net/latest/markets/${rid}/orders/?order_type=${orderType}&type_id=${typeId}&datasource=tranquility`);
      if (res.ok) {
        const arr = await res.json();
        return arr.map(o => ({ ...o, regionId: rid }));
      }
    } catch (err) {
      console.warn(`Error fetching orders for region ${rid}:`, err);
    }
    return [];
  });

  const batchResults = await Promise.all(promises);
  batchResults.forEach(arr => results.push(...arr));

  // 3. Attach region name where available
  results.forEach(o => {
    const r = regionsList.find(rr => String(rr.region_id) === String(o.regionId));
    if (r) o.regionName = r.name;
  });

  return results;
}

async function getStationName(locationId) {
  if (!locationId) return 'Unknown';
  if (stationCache.has(locationId)) return stationCache.get(locationId);

  try {
    if (locationId < 1e9) {
      const res = await fetch(`https://esi.evetech.net/latest/universe/stations/${locationId}/?datasource=tranquility`);
      if (!res.ok) { stationCache.set(locationId, String(locationId)); return String(locationId); }
      const data = await res.json();
      stationCache.set(locationId, data.name || String(locationId));
      return data.name || String(locationId);
    } else {
      const s = `Structure ${locationId}`;
      stationCache.set(locationId, s);
      return s;
    }
  } catch (err) {
    stationCache.set(locationId, String(locationId));
    return String(locationId);
  }
}

// Render functions
function formatNumber(n) { return Number(n).toLocaleString(); }

async function renderOrders(orders, tbodyId, orderType = 'sell', maxDisplay = 100) {
  const tbody = $(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!Array.isArray(orders) || orders.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="4" class="muted small">No orders found</td>`;
    tbody.appendChild(tr);
    return;
  }

  // sort and slice: sells ascending, buys descending
  orders.sort((a, b) => orderType === 'sell' ? a.price - b.price : b.price - a.price);
  const slice = orders.slice(0, maxDisplay);

  for (const o of slice) {
    let station = await getStationName(o.location_id);
    let region = o.regionName || '';
    const locName = region ? `${station} (${region})` : station;
    const expires = o.duration ? `${o.duration}d` : '-';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${o.volume_remain}</td>
      <td>${formatNumber(o.price)}</td>
      <td title="${locName}">${locName}</td>
      <td>${expires}</td>
    `;
    tbody.appendChild(tr);
  }
}

// History chart
async function renderHistoryChart(typeId, regionId) {
  const canvas = $('historyChart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (historyChart) { historyChart.destroy(); historyChart = null; }

  let historyData = [];

  // 1. Determine the list of regions to query
  let regionsToQuery = [];
  const isPLEX = typeId === PLEX_ID;
  
  if (isPLEX) {
    // If PLEX, only query the dedicated PLEX Market Region
    regionsToQuery = [PLEX_MARKET_REGION_ID]; 
  } else if (regionId && regionId !== 'all') {
    // If a specific non-PLEX region is selected
    regionsToQuery = [Number(regionId)];
  } else {
    // If "All Regions" is selected for a non-PLEX item
    regionsToQuery = regionsList.map(r => r.region_id).filter(Boolean);
  }
  
  // 2. Execute the fetch without batching or throttling
  const aggregated = {};
  try {
    const promises = regionsToQuery.map(async rid => {
      try {
        const res = await fetch(`https://esi.evetech.net/latest/markets/${rid}/history/?type_id=${typeId}&datasource=tranquility`);
        if (res.ok) {
          return await res.json().catch(() => []);
        }
      } catch (err) {
        console.warn(`Error fetching history for region ${rid}:`, err);
      }
      return [];
    });

    const allHistory = await Promise.all(promises);
    allHistory.flat().forEach(entry => {
      if (!entry || !entry.date) return;
      aggregated[entry.date] = aggregated[entry.date] || [];
      aggregated[entry.date].push(entry.average || 0);
    });
    
    historyData = Object.keys(aggregated).sort().map(d => ({ date: d, average: aggregated[d].reduce((a,b)=>a+b,0)/aggregated[d].length }));
  } catch (err) {
    console.warn('History fetch error', err);
    historyData = [];
  }

  const labels = historyData.map(h => h.date);
  const data = historyData.map(h => h.average);

  historyChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Average Price',
        data,
        borderColor: '#378937',
        backgroundColor: 'rgba(55,137,55,0.15)',
        fill: true,
        tension: 0.15,
        pointRadius: 0,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      // Enables showing the nearest data point on hover
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: { 
        legend: { display: false },
        // Tooltip configuration to format the price display
        tooltip: {
          enabled: true,
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (context.parsed.y !== null) {
                // Use the global formatNumber function
                label = `${label}: ${formatNumber(context.parsed.y)} ISK`;
              }
              return label;
            }
          }
        }
      }
    }
  });
}

// Search logic
async function performSearch() {
  const input = $('itemInput');
  const regionSelect = $('regionSelect');
  const searchBtn = $('searchBtn');
  if (!input) return;
  const q = input.value.trim();
  if (!q) return;

  if (searchBtn) { searchBtn.disabled = true; searchBtn.textContent = 'Searching...'; }

  try {
    const typeId = await getItemId(q);
    if (!typeId) { 
      const msg = $('statusMessage');
      if (msg) { msg.textContent = 'Item not found'; setTimeout(() => msg.textContent = '', 5000); }
      return;
    }

    // header info
    const itemNameEl = $('itemName');
    const itemImageEl = $('itemImage');

    // find the item in itemsList by typeId
    const foundItem = itemsList.find(it => it.id === typeId);
    const itemName = foundItem ? foundItem.name : q; // fallback to typed query

    if (itemNameEl) itemNameEl.textContent = itemName;
    if (itemImageEl) {
      itemImageEl.src = `https://images.evetech.net/types/${typeId}/icon`;
      itemImageEl.alt = itemName;
      itemImageEl.style.display = 'block';
    }


    let regionId = regionSelect ? regionSelect.value : 'all';
    
    if (typeId === PLEX_ID) {
        // If the item is PLEX, use the dedicated PLEX market region, 19000001,
        // regardless of what region the user selected.
        regionId = String(PLEX_MARKET_REGION_ID);
        console.log(`PLEX detected. Overriding region to PLEX Market (${regionId}).`);
    }

    // fetch buy + sell
    const [sellOrders, buyOrders] = await Promise.all([
      fetchOrders(typeId, regionId, 'sell'),
      fetchOrders(typeId, regionId, 'buy')
    ]);

    // render tables and graph simultaneously
    await Promise.all([
      renderOrders(sellOrders, 'sellOrdersBody', 'sell'),
      renderOrders(buyOrders, 'buyOrdersBody', 'buy'),
      renderHistoryChart(typeId, regionId)
    ]);

  } catch (err) {
    console.error('Search error', err);
    const msg = $('statusMessage');
    if (msg) {
      msg.textContent = 'Search failed — check console for details.';
      setTimeout(() => msg.textContent = '', 5000);
    }
  } finally {
    if (searchBtn) { searchBtn.disabled = false; searchBtn.textContent = 'Search'; }
  }
}

// Table sorting
function makeTableSortable(tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  const table = tbody.closest('table');
  if (!table) return;

  const headers = table.querySelectorAll('th');
  headers.forEach((th, index) => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      sortTableByColumn(tbody, index, headers);
    });
  });
}

function sortTableByColumn(tbody, colIndex, headers) {
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const ascending = tbody.getAttribute('data-sort-col') != colIndex || tbody.getAttribute('data-sort-asc') === 'false';

  // sort rows
  rows.sort((a, b) => {
    const aText = a.children[colIndex].textContent.replace(/,/g, '');
    const bText = b.children[colIndex].textContent.replace(/,/g, '');

    const aNum = parseFloat(aText);
    const bNum = parseFloat(bText);
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return ascending ? aNum - bNum : bNum - aNum;
    }
    return ascending ? aText.localeCompare(bText) : bText.localeCompare(aText);
  });

  // re-add rows
  rows.forEach(r => tbody.appendChild(r));

  // save sort state
  tbody.setAttribute('data-sort-col', colIndex);
  tbody.setAttribute('data-sort-asc', ascending);

  // update arrows
  headers.forEach((h, i) => {
    h.textContent = h.textContent.replace(/[\u25B2\u25BC]/g, ''); // remove arrows
    if (i === colIndex) {
      h.textContent += ascending ? ' \u25B2' : ' \u25BC'; // ▲ or ▼
    }
  });
}