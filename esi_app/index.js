const loadingText = document.getElementById("loading");
const outputDiv = document.getElementById("output");
const lookupBtn = document.getElementById("lookupBtn");
const input = document.getElementById("systemName");

lookupBtn.addEventListener("click", async () => {
  const systemName = input.value.trim();
  if (!systemName) return;

  // show "Loading..."
  loadingText.classList.remove("hidden");
  outputDiv.innerHTML = "";

  try {
    // strict search for exact system name
    const resp = await fetch(
      `https://esi.evetech.net/latest/search/?categories=solar_system&search=${systemName}&strict=true`
    );
    const data = await resp.json();

    if (!data.solar_system) {
      outputDiv.innerHTML = `<p>System not found!</p>`;
      return;
    }

    const systemId = data.solar_system[0];
    const sysResp = await fetch(
      `https://esi.evetech.net/latest/universe/systems/${systemId}/`
    );
    const sysData = await sysResp.json();

    // constellation
    const constResp = await fetch(
      `https://esi.evetech.net/latest/universe/constellations/${sysData.constellation_id}/`
    );
    const constData = await constResp.json();

    // region
    const regResp = await fetch(
      `https://esi.evetech.net/latest/universe/regions/${constData.region_id}/`
    );
    const regData = await regResp.json();

    outputDiv.innerHTML = `
      <h2>System Info</h2>
      <p><b>Name:</b> ${sysData.name}</p>
      <p><b>Constellation:</b> ${constData.name}</p>
      <p><b>Region:</b> ${regData.name}</p>
      <p><b>Security Status:</b> ${sysData.security_status.toFixed(1)}</p>
    `;
  } catch (err) {
    outputDiv.innerHTML = `<p>Error: ${err.message}</p>`;
  } finally {
    // hide "Loading..."
    loadingText.classList.add("hidden");
  }
});
