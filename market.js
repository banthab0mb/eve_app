let historyChartInstance = null;

// Load regions from regions.json
async function loadRegions() {
  const res = await fetch("regions.json");
  const regions = await res.json();
  const regionSelect = document.getElementById("regionSelect");

  // Add "All Regions" option
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All Regions";
  regionSelect.appendChild(allOption);

  // Sort and add other regions
  regions
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(region => {
      const opt = document.createElement("option");
      opt.value = region.region_id;
      opt.textContent = region.name;
      regionSelect.appendChild(opt);
    });
}

// Get item ID from ESI
async function getItemId(name) {
  try {
    const res = await fetch("https://esi.evetech.net/latest/universe/ids/?datasource=tranquility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([name])
    });
    const data = await res.json();
    return data.inventory_types?.[0]?.id || null;
  } catch (err) {
    console.error("Error fetching item ID:", err);
    return null;
  }
}

// Fetch top 20 orders
async function fetchOrders(typeId, regionId, orderType) {
  // Single region
  if (regionId !== "all") {
    try {
      const res = await fetch(`https://esi.evetech.net/latest/markets/${regionId}/orders/?order_type=${orderType}&type_id=${typeId}&datasource=tranquility`);
      if (!res.ok) return [];
      const orders = await res.json();
      orders.sort((a, b) => orderType === "sell" ? a.price - b.price : b.price - a.price);
      return orders.slice(0, 20);
    } catch {
      return [];
    }
  }

  // All regions
  const regionsRes = await fetch("regions.json");
  const regions = await regionsRes.json();

  const allOrders = await Promise.all(
    regions.map(async r => {
      try {
        const res = await fetch(`https://esi.evetech.net/latest/markets/${r.region_id}/orders/?order_type=${orderType}&type_id=${typeId}&datasource=tranquility`);
        if (!res.ok) return [];
        return (await res.json()).map(order => ({ ...order, regionName: r.name }));
      } catch {
        return [];
      }
    })
  );

  const combined = allOrders.flat();
  combined.sort((a, b) => orderType === "sell" ? a.price - b.price : b.price - a.price);
  return combined.slice(0, 20);
}

// Get station or structure name
async function getStationName(id) {
  if (id < 1e9) {
    try {
      const res = await fetch(`https://esi.evetech.net/latest/universe/stations/${id}/?datasource=tranquility`);
      if (!res.ok) return id;
      const data = await res.json();
      return data.name || id;
    } catch {
      return id;
    }
  } else {
    return `Structure ID: ${id}`;
  }
}

// Render orders table
async function renderOrders(orders) {
  const tbody = document.querySelector("#ordersTable tbody");
  tbody.innerHTML = "";

  for (const order of orders) {
    const loc = order.regionName ? order.regionName : await getStationName(order.location_id);
    const expires = order.duration ? `${order.duration} days` : "-";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${order.price.toLocaleString()}</td>
      <td>${order.volume_remain}</td>
      <td>${loc}</td>
      <td>${expires}</td>
    `;
    tbody.appendChild(row);
  }
}

// Render history chart
async function renderHistoryChart(typeId, regionId) {
  const canvas = document.getElementById("historyChart");
  if (!canvas || typeof Chart === "undefined") return;

  // destroy previous chart if exists
  if (historyChartInstance) {
    historyChartInstance.destroy();
    historyChartInstance = null;
  }

  let historyData = [];

  if (regionId === "all") {
    const regionsRes = await fetch("regions.json");
    const regions = await regionsRes.json();

    const allHistory = await Promise.all(
      regions.map(async r => {
        try {
          const res = await fetch(`https://esi.evetech.net/latest/markets/${r.region_id}/history/?type_id=${typeId}&datasource=tranquility`);
          if (!res.ok) return [];
          return (await res.json()).map(day => ({ date: day.date, average: day.average }));
        } catch {
          return [];
        }
      })
    );

    const combined = {};
    allHistory.flat().forEach(entry => {
      if (!combined[entry.date]) combined[entry.date] = [];
      combined[entry.date].push(entry.average);
    });

    historyData = Object.keys(combined).sort().map(date => ({
      date,
      average: combined[date].reduce((a,b)=>a+b,0)/combined[date].length
    }));

  } else {
    try {
      const res = await fetch(`https://esi.evetech.net/latest/markets/${regionId}/history/?type_id=${typeId}&datasource=tranquility`);
      historyData = res.ok ? await res.json() : [];
    } catch {
      historyData = [];
    }
  }

  const labels = historyData.map(h => h.date);
  const prices = historyData.map(h => h.average);

  historyChartInstance = new Chart(canvas.getContext("2d"), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Average Price',
        data: prices,
        borderColor: '#378937',
        backgroundColor: 'rgba(55,137,55,0.2)',
        fill: true,
        tension: 0.2
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: {
        x: { title: { display: true, text: 'Date' } },
        y: { title: { display: true, text: 'ISK' }, beginAtZero: false }
      }
    }
  });
}

// Handle search
async function handleSearch() {
  const itemName = document.getElementById("itemInput").value.trim();
  const regionId = document.getElementById("regionSelect").value;
  const orderType = document.getElementById("orderTypeSelect").value;

  if (!itemName) return;

  const typeId = await getItemId(itemName);
  if (!typeId) return alert("Item not found");

  const orders = await fetchOrders(typeId, regionId, orderType);
  await renderOrders(orders);

  await renderHistoryChart(typeId, regionId);
}

// Init
window.onload = loadRegions;
document.getElementById("searchBtn").addEventListener("click", handleSearch);