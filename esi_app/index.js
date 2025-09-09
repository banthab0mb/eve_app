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

    try {
        // Step 1: Fetch all system IDs
        const allIdsResp = await fetch("https://esi.evetech.net/latest/universe/systems");
        if (!allIdsResp.ok) throw new Error("Failed to fetch system IDs");
        const systemIds = await allIdsResp.json();

        let matchedSystem = null;

        // Step 2: Loop through IDs to find exact match
        for (const id of systemIds) {
            const resp = await fetch(`https://esi.evetech.net/universe/systems/${id}`);
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

        // Step 3: Fetch constellation
        let constellationName = "Unknown";
        try {
            const constResp = await fetch(`https://esi.evetech.net/latest/universe/constellations/${matchedSystem.constellation_id}/`);
            if (constResp.ok) {
                const constDetails = await constResp.json();
                constellationName = constDetails.name;
            }
        } catch {}

        // Step 4: Fetch region
        let regionName = "Unknown";
        try {
            const constResp = await fetch(`https://esi.evetech.net/latest/universe/constellations/${matchedSystem.constellation_id}/`);
            if (constResp.ok) {
                const regionId = (await constResp.json()).region_id;
                const regionResp = await fetch(`https://esi.evetech.net/latest/universe/regions/${regionId}/`);
                if (regionResp.ok) {
                    regionName = (await regionResp.json()).name;
                }
            }
        } catch {}

        // Step 5: Output
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
