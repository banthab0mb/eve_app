const loading = document.getElementById("loading");
const output2 = document.getElementById("output");
const lookupBtn = document.getElementById("lookupBtn");
const inputBox = document.getElementById("systemName");

lookupBtn.addEventListener("click", async () => {
  const systemName = inputBox.value.trim();
  if (!systemName) return;

  loading.classList.remove("hidden");
  output2.innerHTML = "";

  try {
    const searchResp = await fetch(
      `https://esi.evetech.net/latest/universe/systems/?search=${systemName}`
    );
    const systemIds = await searchResp.json();

    if (!systemIds || systemIds.length === 0) {
      output2.innerHTML = `<p>System not found!</p>`;
      return;
    }

    let matchedSystem = null;
    for (const id of systemIds) {
      const resp = await fetch(
        `https://esi.evetech.net/latest/universe/systems/${id}/`
      );
      if (!resp.ok) continue;

      const details = await resp.json();
      if (details.name.toLowerCase() === systemName.toLowerCase()) {
        matchedSystem = details;
        break;
      }
    }

    if (!matchedSystem) {
      output2.innerHTML = `<p>Exact system match not found!</p>`;
      return;
    }

    // Get constellation name
    let constellationName = "Unknown";
    try {
      const constResp = await fetch(
        `https://esi.evetech.net/latest/universe/constellations/${matchedSystem.constellation_id}/`
      );
      if (constResp.ok) {
        const constDetails = await constResp.json();
        constellationName = constDetails.name;
      }
    } catch {}

    // Get region name
    let regionName = "Unknown";
    try {
      const constResp = await fetch(
        `https://esi.evetech.net/latest/universe/constellations/${matchedSystem.constellation_id}/`
      );
      if (constResp.ok) {
        const constDetails = await constResp.json();
        const regionResp = await fetch(
          `https://esi.evetech.net/latest/universe/regions/${constDetails.region_id}/`
        );
        if (regionResp.ok) {
          const regionData = await regionResp.json();
          regionName = regionData.name;
        }
      }
    } catch {}

    // Show results
    output2.innerHTML = `
      <p><strong>Name:</strong> ${matchedSystem.name}</p>
      <p><strong>Constellation:</strong> ${constellationName}</p>
      <p><strong>Region:</strong> ${regionName}</p>
      <p><strong>Security Status:</strong> ${matchedSystem.security_status.toFixed(1)}</p>
    `;
  } catch (err) {
    output2.innerHTML = `<p style="color:red;">Error: ${err.message}</p>`;
  } finally {
    loading.classList.add("hidden");
  }
});
