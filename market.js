// load regions from regions.json
async function loadRegions() {
  const res = await fetch("regions.json");
  const regions = await res.json();
  const regionSelect = document.getElementById("regionSelect");

  regions
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(region => {
      const opt = document.createElement("option");
      opt.value = region.region_id;
      opt.textContent = region.name;
      regionSelect.appendChild(opt);
    });
}

// get item ID
async function getItemId(name) {
  const res = await fetch("https://esi.evetech.net/latest/universe/ids/?datasource=tranquility", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([name])
  });
  const data = await res.json();
  return data.inventory_types?.[0]?.id || null;
}

// fetch orders
async function fetchOrders(typeId, regionId, orderType) {
  const res = await fetch(`https://esi.evetech.net/latest/markets/${regionId}/orders/?order_type=${orderType}&type_id=${typeId}&datasource=tranquility`);
  if (!res.ok) return [];
  const orders = await res.json();
  orders.sort((a, b) => orderType === "sell" ? a.price - b.price : b.price - a.price);
  return orders.slice(0, 20); // top 20
}

// get station/structure name
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

// render orders table
async function renderOrders(orders) {
  const tbody = document.querySelector("#ordersTable tbody");
  tbody.innerHTML = "";

  for (const order of orders) {
    const loc = await getStationName(order.location_id);
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

// placeholder chart
function renderHistoryChart() {
  const ctx = document.getElementById("historyChart").getContext("2d");
  new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Price History', data: [] }] },
    options: { responsive: true }
  });
}

// search handler
async function handleSearch() {
  const itemName = document.getElementById("itemInput").value.trim();
  const regionId = document.getElementById("regionSelect").value;
  const orderType = document.getElementById("orderTypeSelect").value;

  if (!itemName) return;

  const typeId = await getItemId(itemName);
  if (!typeId) return alert("Item not found");

  const orders = await fetchOrders(typeId, regionId, orderType);
  await renderOrders(orders);
  renderHistoryChart(); // placeholder
}

// init
window.onload = loadRegions;
document.getElementById("searchBtn").addEventListener("click", handleSearch);