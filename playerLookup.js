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
async function lookupEntity(name) {
  try {
    // Step 1: search
    const res = await fetch(
      `https://esi.evetech.net/latest/search/?categories=character,corporation,alliance&search=${encodeURIComponent(name)}&strict=true`
    );

    if (res.status === 404) {
      console.log("No matches found.");
      return null;
    }
    const data = await res.json();

    // Step 2: pick first hit by category priority
    if (data.character?.length) {
      const id = data.character[0];
      const charRes = await fetch(`https://esi.evetech.net/latest/characters/${id}/`);
      const charData = await charRes.json();
      return { type: "character", id, ...charData };
    }
    if (data.corporation?.length) {
      const id = data.corporation[0];
      const corpRes = await fetch(`https://esi.evetech.net/latest/corporations/${id}/`);
      const corpData = await corpRes.json();
      return { type: "corporation", id, ...corpData };
    }
    if (data.alliance?.length) {
      const id = data.alliance[0];
      const allRes = await fetch(`https://esi.evetech.net/latest/alliances/${id}/`);
      const allData = await allRes.json();
      return { type: "alliance", id, ...allData };
    }
  } catch (err) {
    console.error("Lookup error:", err);
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
