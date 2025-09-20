const searchBtn = document.getElementById("searchBtn");
const itemInput = document.getElementById("itemInput");
const resultsDiv = document.getElementById("results");

// Hardcode Jita (The Forge region = 10000002) for now
const REGION_ID = 10000002;

searchBtn.addEventListener("click", () => {
  const query = itemInput.value.trim();
  if (!query) return;

  resultsDiv.innerHTML = "<p>Searching...</p>";

  // Step 1: Search for item ID
  fetch(`https://esi.evetech.net/latest/search/?categories=inventory_type&search=${encodeURIComponent(query)}&strict=false&datasource=tranquility`)
    .then(async res => {
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      return res.json();
    })
    .then(data => {
      if (!data.inventory_type || data.inventory_type.length === 0) {
        resultsDiv.innerHTML = `<p>No items found for "${query}".</p>`;
        return;
      }

      const typeId = data.inventory_type[0];

      // Step 2: Fetch market orders in Jita
      return fetch(`https://esi.evetech.net/latest/markets/${REGION_ID}/orders/?order_type=sell&type_id=${typeId}&datasource=tranquility`)
        .then(async res => {
          if (!res.ok) throw new Error(`Market fetch failed: ${res.status}`);
          return res.json();
        })
        .then(orders => {
          if (!Array.isArray(orders) || orders.length === 0) {
            resultsDiv.innerHTML = "<p>No market data found.</p>";
            return;
          }

          // Sort by price
          orders.sort((a, b) => a.price - b.price);
          const cheapest = orders[0];

          // Step 3: Look up station name
          return fetch(`https://esi.evetech.net/latest/universe/stations/${cheapest.location_id}/?datasource=tranquility`)
            .then(async res => {
              if (!res.ok) throw new Error(`Station fetch failed: ${res.status}`);
              return res.json();
            })
            .then(station => {
              resultsDiv.innerHTML = `
                <h2>Cheapest Sell Order for "${query}"</h2>
                <p><strong>Price:</strong> ${cheapest.price.toLocaleString()} ISK</p>
                <p><strong>Location:</strong> ${station.name}</p>
              `;
            })
            .catch(() => {
              resultsDiv.innerHTML = `
                <h2>Cheapest Sell Order for "${query}"</h2>
                <p><strong>Price:</strong> ${cheapest.price.toLocaleString()} ISK</p>
                <p><strong>Station ID:</strong> ${cheapest.location_id}</p>
                <p><em>(Could not fetch station name)</em></p>
              `;
            });
        });
    })
    .catch(err => {
      console.error(err);
      resultsDiv.innerHTML = "<p>Error fetching market data.</p>";
    });
});