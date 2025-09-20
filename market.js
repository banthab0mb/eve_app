const searchBtn = document.getElementById("searchBtn");
const itemInput = document.getElementById("itemInput");
const resultsDiv = document.getElementById("results");

// region id for Jita (The Forge)
const REGION_ID = 10000002;

// function to turn a name into an ID
async function resolveNameToId(name) {
  const res = await fetch("https://esi.evetech.net/latest/universe/ids/?datasource=tranquility", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([name])
  });
  if (!res.ok) throw new Error("id lookup failed");
  const data = await res.json();
  // just grab the first match in inventory_type
  if (data.inventory_types && data.inventory_types.length > 0) {
    return data.inventory_types[0].id;
  }
  return null;
}

// function to get cheapest sell and highest buy
async function getMarketOrders(typeId) {
  // sell orders
  const sellRes = await fetch(`https://esi.evetech.net/latest/markets/${REGION_ID}/orders/?order_type=sell&type_id=${typeId}&datasource=tranquility`);
  if (!sellRes.ok) throw new Error("sell orders failed");
  const sells = await sellRes.json();

  // buy orders
  const buyRes = await fetch(`https://esi.evetech.net/latest/markets/${REGION_ID}/orders/?order_type=buy&type_id=${typeId}&datasource=tranquility`);
  if (!buyRes.ok) throw new Error("buy orders failed");
  const buys = await buyRes.json();

  // sort them
  sells.sort((a, b) => a.price - b.price); // low to high
  buys.sort((a, b) => b.price - a.price);  // high to low

  return {
    cheapestSell: sells[0] || null,
    highestBuy: buys[0] || null
  };
}

// function to lookup station name
async function getStationName(stationId) {
  const res = await fetch(`https://esi.evetech.net/latest/universe/stations/${stationId}/?datasource=tranquility`);
  if (!res.ok) return stationId; // fallback
  const data = await res.json();
  return data.name || stationId;
}

// main button event
searchBtn.addEventListener("click", async () => {
  const query = itemInput.value.trim();
  if (!query) return;

  resultsDiv.innerHTML = "<p>Searching...</p>";

  try {
    // get typeId
    const typeId = await resolveNameToId(query);
    if (!typeId) {
      resultsDiv.innerHTML = `<p>No item found for "${query}".</p>`;
      return;
    }

    // get market data
    const { cheapestSell, highestBuy } = await getMarketOrders(typeId);

    if (!cheapestSell && !highestBuy) {
      resultsDiv.innerHTML = "<p>No market orders found.</p>";
      return;
    }

    // get station names (async both)
    const sellStation = cheapestSell ? await getStationName(cheapestSell.location_id) : null;
    const buyStation = highestBuy ? await getStationName(highestBuy.location_id) : null;

    // output
    resultsDiv.innerHTML = `
      <h2>Market for "${query}"</h2>
      ${cheapestSell ? `
        <h3>Cheapest Sell</h3>
        <p><strong>Price:</strong> ${cheapestSell.price.toLocaleString()} ISK</p>
        <p><strong>Location:</strong> ${sellStation}</p>
      ` : "<p>No sell orders.</p>"}

      ${highestBuy ? `
        <h3>Highest Buy</h3>
        <p><strong>Price:</strong> ${highestBuy.price.toLocaleString()} ISK</p>
        <p><strong>Location:</strong> ${buyStation}</p>
      ` : "<p>No buy orders.</p>"}
    `;
  } catch (err) {
    console.error(err);
    resultsDiv.innerHTML = "<p>Error fetching market data.</p>";
  }
});