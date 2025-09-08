const lookupBtn = document.getElementById("lookupBtn");
const outputDiv = document.getElementById("output");

lookupBtn.addEventListener("click", async () => {
  const systemName = document.getElementById("systemName").value.trim();
  if (!systemName) {
    outputDiv.innerHTML = "<p>Please enter a system name.</p>";
    return;
  }

  outputDiv.innerHTML = "<p>Searching...</p>";

  try {
    const systemIdsResp = await fetch(`https://esi.evetech.net/latest/universe/systems/?search=${systemName}`);
    const systemIds = await systemIdsResp.json();

    if (!systemIds || systemIds.length === 0) {
      outputDiv.innerHTML = "<p>System not found.</p>";
      return;
    }

    let matchedSystem = null;
    for (const id of systemIds) {
      const resp = await fetch(`https://esi.evetech.net/latest/universe/systems/${id}/`);
      if (!resp.ok) continue;

      const details = await resp.json();
      if (details.name.toLowerCase() === systemName.toLowerCase()) {
        matchedSystem = details;
        break;
      }
    }

    if (!matchedSystem) {
      outputDiv.innerHTML = "<p>Exact system match not found.</p>";
      return;
    }

    // constellation
    const constResp = await fetch(`https://esi.evetech.net/latest/universe/constellations/${matchedSystem.constellation_id}/`);
    const constData = await constResp.json();

    // region
    const regionResp = await fetch(`https://esi.evetech.net/latest/universe/regions/${constData.region_id}/`);
    const regionData = await regionResp.json();

    outputDiv.innerHTML = `
      <h2>System Info</h2>
      <p><strong>Name:</strong> ${matchedSystem.name}</p>
      <p><strong>Constellation:</strong> ${constData.name}</p>
      <p><strong>Region:</strong> ${regionData.name}</p>
      <p><strong>Security Status:</strong> ${matchedSystem.security_status.toFixed(1)}</p>
    `;
  } catch (err) {
    outputDiv.innerHTML = `<p>Error fetching system data: ${err.message}</p>`;
  }
});
