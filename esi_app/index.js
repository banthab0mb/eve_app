import fetch from 'node-fetch';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'node:process';

async function getSystemInfo(systemName) {

    try {
        loading.classList.remove("hidden"); // show spinner
        output2.innerHTML = ""; // clear old output

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
        // Fetch Constellation details via system name
        const constResp = await fetch(`https://esi.evetech.net/latest/universe/constellations/${matchedSystem.constellation_id}/`);
        
        // Pull constellation name from the response if fetch was successful
        if (constResp.ok) {
            const constDetails = await constResp.json();
            constellationName = constDetails.name;
        }

        // Fetch region name via constellation
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
    } catch (err) {
        output2.innerHTML = `<p style="color:red;">Error: ${err.message}</p>`;
    } finally{ 
        loading.classList.add("hidden");
    }
    console.log(`Name: ${matchedSystem.name}`);
    console.log(`Constellation: ${constellationName}`);
    console.log(`Region: ${regionName}`);
    console.log(`Security Status: ${matchedSystem.security_status.toFixed(1)}`);
}

const rl = readline.createInterface({ input, output });
const name = await rl.question("Enter system name: ");
await getSystemInfo(name);
rl.close();
