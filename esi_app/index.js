const loadingText = document.getElementById("loading");
const outputDiv = document.getElementById("output");
const lookupBtn = document.getElementById("lookupBtn");
const input = document.getElementById("systemName");

loadingText.style.display = "none"; // hide initially

lookupBtn.addEventListener("click", async () => {
    
    const systemName = input.value.trim();
    if (!systemName) return;

    loadingText.style.display = "block";
    outputDiv.innerHTML = "";

    // Search for matching system IDs
    const searchResp = await fetch(`https://esi.evetech.net/latest/universe/systems/?search=${systemName}`);
    const systemIds = await searchResp.json();

    if (!systemIds || systemIds.length === 0) {
        console.log("System not found!");
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
        console.log("Exact system match not found!");
        return;
    }

    // Fetch constellation name
    let constellationName = "Unknown";
    try {
        // Fetch Constellation details via system name
        const constResp = await fetch(`https://esi.evetech.net/latest/universe/constellations/${matchedSystem.constellation_id}/`);
        
        // Pull constellation name from the response if fetch was successful
        if (constResp.ok) {
            const constDetails = await constResp.json();
            constellationName = constDetails.name;
        }
    } catch {}

    // Fetch region name via constellation
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

        outputDiv.innerHTML = `
        <h2>System Info</h2>
        <p><b>Name:</b> ${matchedSystem.name}</p>
        <p><b>Constellation:</b> ${constellationName}</p>
        <p><b>Region:</b> ${regionName}</p>
        <p><b>Security Status:</b> ${matchedSystem.security_status.toFixed(1)}</p>
        `;
        }
);
