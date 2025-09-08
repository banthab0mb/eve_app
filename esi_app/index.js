const lookupBtn = document.getElementById("lookupBtn");
const systemInput = document.getElementById("systemName");
const outputDiv = document.getElementById("output");
const loadingSpinner = document.getElementById("loading");

lookupBtn.addEventListener("click", async () => {
  const name = systemInput.value.trim();
  if (!name) return;

  outputDiv.innerHTML = "Searching...";
  loadingSpinner.classList.add("active");

  try {
    // Step 1: resolve system name -> system ID
    const idRes = await fetch("https://esi.evetech.net/latest/universe/ids/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([name]),
    });

    const idData = await idRes.json();
    if (!idData.solar_systems || idData.solar_systems.length === 0) {
      throw new Error("System not found");
    }

    const systemId = idData.solar_systems[0].id;

    // Step 2: fetch system info by ID
    const sysRes = await fetch(
      `https://esi.evetech.net/latest/universe/systems/${systemId}/`
    );
    const sysData = await sysRes.json();

    // Step 3: fetch constellation name
    const constRes = await fetch(
      `https://esi.evetech.net/latest/universe/constellations/${sysData.constellation_id}/`
    );
    const constData = await constRes.json();

    // Step 4: fetch region name
    const regionRes = await fetch(
      `https://esi.evetech.net/latest/universe/regions/${constData.region_id}/`
    );
    const regionData = await regionRes.json();

    // Step 5: display results
    outputDiv.innerHTML = `
      <h2>${name}</h2>
      <p><b>System ID:</b> ${systemId}</p>
      <p><b>Security Status:</b> ${sysData.security_status.toFixed(2)}</p>
      <p><b>Constellation:</b> ${constData.name} (ID: ${sysData.constellation_id})</p>
      <p><b>Region:</b> ${regionData.name} (ID: ${regionData.region_id})</p>
      <p><b>Star ID:</b> ${sysData.star_id}</p>
    `;
  } catch (err) {
    outputDiv.innerHTML = `<p style="color: red;">Error: ${err.message}</p>`;
  } finally {
    loadingSpinner.classList.remove("active");
  }
});
