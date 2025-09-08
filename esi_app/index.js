lookupBtn.addEventListener("click", async () => {
  const systemName = input.value.trim();
  if (!systemName) return;

  loadingText.style.display = "block";
  outputDiv.innerHTML = "";

  try {
    const searchResp = await fetch(
      `https://esi.evetech.net/latest/search/?categories=solar_system&search=${systemName}`
    );
    const searchText = await searchResp.text();

    let searchData;
    try { searchData = JSON.parse(searchText); } 
    catch { 
      outputDiv.innerHTML = "<p>System not found!</p>";
      return;
    }

    if (!searchData.solar_system || searchData.solar_system.length === 0) {
      outputDiv.innerHTML = "<p>System not found!</p>";
      return;
    }

    let matchedSystem = null;
    for (const id of searchData.solar_system) {
      const resp = await fetch(`https://esi.evetech.net/latest/universe/systems/${id}/`);
      if (!resp.ok) continue;
      const details = await resp.json();
      if (details.name.toLowerCase() === systemName.toLowerCase()) {
        matchedSystem = details;
        break;
      }
    }

    if (!matchedSystem) {
      outputDiv.innerHTML = "<p>Exact system match not found!</p>";
      return;
    }

    // Constellation
    let constellationName = "Unknown";
    try {
      const constResp = await fetch(`https://esi.evetech.net/latest/universe/constellations/${matchedSystem.constellation_id}/`);
      if (constResp.ok) {
        constellationName = (await constResp.json()).name;
      }
    } catch {}

    // Region
    let regionName = "Unknown";
    try {
      const constResp = await fetch(`https://esi.evetech.net/latest/universe/constellations/${matchedSystem.constellation_id}/`);
      if (constResp.ok) {
        const regionId = (await constResp.json()).region_id;
        const regionResp = await fetch(`https://esi.evetech.net/latest/universe/regions/${regionId}/`);
        if (regionResp.ok) regionName = (await regionResp.json()).name;
      }
    } catch {}

    outputDiv.innerHTML = `
      <h2>System Info</h2>
      <p><b>Name:</b> ${matchedSystem.name}</p>
      <p><b>Constellation:</b> ${constellationName}</p>
      <p><b>Region:</b> ${regionName}</p>
      <p><b>Security Status:</b> ${matchedSystem.security_status.toFixed(1)}</p>
    `;
  } catch (err) {
    outputDiv.innerHTML = `<p>Error: ${err.message}</p>`;
  } finally {
    loadingText.style.display = "none";
  }
});
