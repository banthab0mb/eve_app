const loadingText = document.getElementById("loading");
const outputDiv = document.getElementById("output");
const lookupBtn = document.getElementById("lookupBtn");
const input = document.getElementById("systemName");

loadingText.style.display = "none";

// Fetch all system IDs and cache
async function fetchAllSystemIds() {
    const cached = localStorage.getItem("eveSystemIds");
    if (cached) return JSON.parse(cached);

    const resp = await fetch("https://esi.evetech.net/latest/universe/systems");
    if (!resp.ok) throw new Error("Failed to fetch system IDs");
    const ids = await resp.json();

    localStorage.setItem("eveSystemIds", JSON.stringify(ids));
    return ids;
}

// Fetch system details
async function fetchSystem(id) {
    const resp = await fetch(`https://esi.evetech.net/universe/systems/${id}`);
    if (!resp.ok) return null;
    return resp.json();
}

// Fetch constellation name
async function fetchConstellation(id) {
    const resp = await fetch(`https://esi.evetech.net/latest/universe/constellations/${id}/`);
    if (!resp.ok) return { name: "Unknown", region_id: null };
    const data = await resp.json();
    return { name: data.name, region_id: data.region_id };
}

// Fetch region name
async function fetchRegion(id) {
    if (!id) return "Unknown";
    const resp = await fetch(`https://esi.evetech.net/latest/universe/regions/${id}/`);
    if (!resp.ok) return "Unknown";
    const data = await resp.json();
    return data.name;
}

lookupBtn.addEventListener("click", async () => {
    const systemName = input.value.trim();
    if (!systemName) return;

    loadingText.style.display = "inline";
    outputDiv.innerHTML = "";

    try {
        const systemIds = await fetchAllSystemIds();
        let matchedSystem = null;

        for (const id of systemIds) {
            const system = await fetchSystem(id);
            if (!system) continue;
            if (system.name.toLowerCase() === systemName.toLowerCase()) {
                matchedSystem = system;
                break;
            }
        }

        if (!matchedSystem) {
            outputDiv.innerHTML = "<p>System not found!</p>";
            return;
        }

        const constData = await fetchConstellation(matchedSystem.constellation_id);
        const regionName = await fetchRegion(constData.region_id);

        outputDiv.innerHTML = `
            <h2>System Info</h2>
            <p><b>Name:</b> ${matchedSystem.name}</p>
            <p><b>Constellation:</b> ${constData.name}</p>
            <p><b>Region:</b> ${regionName}</p>
            <p><b>Security Status:</b> ${matchedSystem.security_status.toFixed(1)}</p>
        `;

    } catch (err) {
        outputDiv.innerHTML = `<p>Error: ${err.message}</p>`;
    } finally {
        loadingText.style.display = "none";
    }
});
