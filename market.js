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

// look up item ID from name
async function getItemId(itemName) {
  try {
    const res = await fetch("https://esi.evetech.net/latest/universe/ids/?datasource=tranquility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([itemName])
    });
    if (!res.ok) throw new Error("Item not found");
    const data = await res.json();
    return data.inventory_types?.[0]?.id || null;
  } catch (err) {
    console.error("Error fetching item ID:", err);
    return null;
  }
}

// fetch cheapest order in region
async function getCheapestOrder(itemId, regionId) {
  try {
    const res = await fetch(`https://esi.evetech.net/latest/markets/${regionId}/orders/?order_type=sell&type_id=${itemId}&datasource=tranquility`);
    if (!res.ok) throw new Error("Failed to fetch market orders");
    const orders = await res.json();
    if (!orders.length) return null;

    orders.sort((a, b) => a.price - b.price);
    return orders[0];
  } catch (err) {
    console.error("Error fetching orders:", err);
    return null;
  }
}

// get station/structure name if possible
async function getStationName(stationId) {
  if (stationId < 1000000000) {
    try {
      const res = await fetch(`https://esi.evetech.net/latest/universe/stations/${stationId}/?datasource=tranquility`);
      if (!res.ok) return stationId;
      const data = await res.json();
      return data.name || stationId;
    } catch {
      return stationId;
    }
  } else {
    return `Structure ID: ${stationId}`;
  }
}

// main search handler
async function handleSearch() {
  const itemName = document.getElementById("itemInput").value.trim();
  const regionId = document.getElementById("regionSelect").value;
  const resultsDiv = document.getElementById("results");

  if (!itemName) {
    resultsDiv.innerHTML = "<p>Please enter an item name.</p>";
    return;
  }

  resultsDiv.innerHTML = "<p>Searching...</p>";

  const itemId = await getItemId(itemName);
  if (!itemId) {
    resultsDiv.innerHTML = `<p>Item not found: ${itemName}</p>`;
    return;
  }

  const cheapest = await getCheapestOrder(itemId, regionId);
  if (!cheapest) {
    resultsDiv.innerHTML = `<p>No market orders found for ${itemName} in this region.</p>`;
    return;
  }

  const stationName = await getStationName(cheapest.location_id);

  resultsDiv.innerHTML = `
    <h3>Cheapest ${itemName}</h3>
    <p><strong>Price:</strong> ${cheapest.price.toLocaleString()} ISK</p>
    <p><strong>Location:</strong> ${stationName}</p>
    <p><strong>Volume Remaining:</strong> ${cheapest.volume_remain}</p>
  `;
}

// init
document.getElementById("searchBtn").addEventListener("click", handleSearch);
window.onload = loadRegions;