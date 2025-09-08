async function getSystemInfo(systemName) {
  const outputDiv = document.getElementById("output");
  outputDiv.textContent = "Searching...";

  try {
    // Search for matching system IDs
    const searchResp = await fetch(`https://esi.evetech.net/latest/universe/systems/?search=${systemName}`);
    const systemIds = await searchResp.json();

    if (!systemIds || systemIds.length === 0) {
      outputDiv.textContent = "System not found!";
      return;
    }

    let matchedSystem = null;

    // Loop through IDs to find exact match
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
      outputDiv.textContent = "Exact system match not found!";
      return;
    }

    // Fetch constellation name
    let constellationName = "Unknown";
    try {
      const constResp = await fetch(`https://esi.evetech.net/latest/universe/constellations/${matchedSystem.constellation_id}/`);
      if (constResp.ok) {
        const constDetails = await constResp.json();
        constellationName = constDetails.name;
      }
    } catch {}

    // Fetch region name
    let regionName = "Unknown";
    try {
      const constellationResp = await fetch(`https://esi.evetech.net/latest/universe/constellations/${matchedSystem.constellation_id}/`);
      if (constellationResp.ok) {
        const constellationData = await constellationResp.json();
        const regionId = constellationData.region_id;

        const regionResp = await fetch(`https://esi.evetech.net/latest/universe/regions/${regionId}/`);
        if (regionResp.ok) {
          const regionData = await regionResp.json();
          regionName = regionData.name;
        }
      }
    } catch {}

    // Output results
    outputDiv.innerHTML = `
      <pre>
        Name: ${matchedSystem.name}
        Constellation: ${constellationName}
        Region: ${regionName}
        Security Status: ${matchedSystem.security_status.toFixed(2)}
      </pre>
    `;

  } catch (err) {
    console.error(err);
    outputDiv.textContent = "Error fetching system data.";
  }
}

// Hook up button
document.getElementById("lookupBtn").addEventListener("click", () => {
  const name = document.getElementById("systemName").value.trim();
  if (name) {
    getSystemInfo(name);
  }
});