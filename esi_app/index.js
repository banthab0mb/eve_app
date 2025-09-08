const loading = document.getElementById("loading");
const output2 = document.getElementById("output");
const form = document.getElementById("systemForm");
const inputBox = document.getElementById("systemInput");

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const systemName = inputBox.value.trim();
    if (!systemName) return;
    await getSystemInfo(systemName);
});

async function getSystemInfo(systemName) {
    loading.classList.remove("hidden"); // show spinner
    output2.innerHTML = ""; // clear old output

    try {
        // Search for matching system IDs
        const searchResp = await fetch(`https://esi.evetech.net/latest/universe/systems/?search=${systemName}`);
        if (!searchResp.ok) throw new Error("Failed to search systems.");
        const systemIds = await searchResp.json();

        if (!systemIds || systemIds.length === 0) {
            output2.innerHTML = `<p style="color:red;">System not found!</p>`;
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
            output2.innerHTML = `<p style="color:red;">Exact system match not found!</p>`;
            return;
        }

        // Fetch constellation name
        let constellationName = "Unknown";
        const constResp = await fetch(`https://esi.evetech.net/latest/universe/constellations/${matchedSystem.constellation_id}/`);
        if (constResp.ok) {
            const constDetails = await constResp.json();
            constellationName = constDetails.name;
        }

        // Fetch region name
        let regionName = "Unknown";
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

        // Show results
        output2.innerHTML = `
            <h3>System Info</h3>
            <p><b>Name:</b> ${matchedSystem.name}</p>
            <p><b>Constellation:</b> ${constellationName}</p>
            <p><b>Region:</b> ${regionName}</p>
            <p><b>Security Status:</b> ${matchedSystem.security_status.toFixed(1)}</p>
        `;

    } catch (err) {
        output2.innerHTML = `<p style="color:red;">Error: ${err.message}</p>`;
    } finally {
        loading.classList.add("hidden"); // always hide spinner
    }
}