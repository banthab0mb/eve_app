// playerLookup.js

let alliances = [];
let corporations = [];

async function loadData() {
    const [alliancesRes, corpsRes] = await Promise.all([
        fetch('alliances.json'),
        fetch('corporations.json')
    ]);

    alliances = await alliancesRes.json();
    corporations = await corpsRes.json();
}

// Helper: GET from ESI
async function esiGet(url) {
    const res = await fetch(`https://esi.evetech.net/latest${url}`);
    if (!res.ok) throw new Error(`ESI error ${res.status}: ${url}`);
    return await res.json();
}

// Helper: POST to ESI
async function esiPost(url, body) {
    const res = await fetch(`https://esi.evetech.net/latest${url}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`ESI error ${res.status}: ${url}`);
    return await res.json();
}

// Lookup a player/corp/alliance by name
async function lookupPlayer(name) {
    try {
        const ids = await esiPost("/universe/ids/", [name]);

        let category, id;
        if (ids.characters) { category = "character"; id = ids.characters[0].id; }
        else if (ids.corporations) { category = "corporation"; id = ids.corporations[0].id; }
        else if (ids.alliances) { category = "alliance"; id = ids.alliances[0].id; }
        else return null;

        const details = await esiGet(`/${category}s/${id}/`);

        if (category === "character") {
            const corpId = details.corporation_id;
            const corp = await esiGet(`/corporations/${corpId}/`);
            let alliance = null;
            if (corp.alliance_id) {
                alliance = await esiGet(`/alliances/${corp.alliance_id}/`);
            }
            return {
                category,
                id,
                details,
                corp,
                alliance,
                portrait: `https://images.evetech.net/characters/${id}/portrait?size=128`
            };
        }

        return { category, id, details };
    } catch (err) {
        console.error("Error in lookupPlayer:", err);
        return null;
    }
}

// Fetch autocomplete suggestions
async function fetchSuggestions(query) {
    if (!query || query.length < 3) return [];

    const url = `https://esi.evetech.net/latest/search/?categories=character,corporation,alliance&search=${encodeURIComponent(query)}&strict=false`;
    try {
        const res = await fetch(url);
        if (!res.ok) return [];

        const data = await res.json();
        const ids = [];
        for (let type of Object.keys(data)) ids.push(...data[type]);
        if (!ids.length) return [];

        return await esiPost("/universe/names/", ids);
    } catch (err) {
        console.error("Error in fetchSuggestions:", err);
        return [];
    }
}

// Format clean output
function formatOutput(result) {
    if (!result) return "No results found.";

    if (result.category === "character") {
        const char = result.details;
        const corp = result.corp;
        const alliance = result.alliance;
        return `
Character: ${char.name} (ID: ${result.id})
Birthday: ${char.birthday}
Sec Status: ${char.security_status ?? "N/A"}

Corporation: ${corp.name} [${corp.ticker}] (ID: ${corp.corporation_id})
Alliance: ${alliance ? `${alliance.name} [${alliance.ticker}] (ID: ${alliance.alliance_id})` : "None"}
        `.trim();
    }

    if (result.category === "corporation") {
        const corp = result.details;
        return `
Corporation: ${corp.name} [${corp.ticker}] (ID: ${result.id})
Alliance ID: ${corp.alliance_id ?? "None"}
        `.trim();
    }

    if (result.category === "alliance") {
        const alliance = result.details;
        return `
Alliance: ${alliance.name} [${alliance.ticker}] (ID: ${result.id})
Date Founded: ${alliance.date_founded}
        `.trim();
    }

    return JSON.stringify(result, null, 2);
}

// Example usage
(async () => {
    await loadData();

    const suggestions = await fetchSuggestions("Erica");
    console.log("Suggestions:", suggestions);

    const player = await lookupPlayer("Erica Romero");
    console.log("Lookup:", formatOutput(player));
})();
