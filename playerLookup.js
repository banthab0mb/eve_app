// playerLookup.js

// Make sure alliances.json and corporations.json are loaded beforehand
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

// Lookup a player by name
async function lookupPlayer(name) {
    const searchUrl = `https://esi.evetech.net/latest/search/?categories=character&strict=true&search=${encodeURIComponent(name)}&datasource=tranquility`;

    try {
        const res = await fetch(searchUrl);
        if (!res.ok) {
            console.error("Search failed:", res.status);
            return null;
        }

        const data = await res.json();
        if (!data.character || data.character.length === 0) {
            console.log("Character not found");
            return null;
        }

        const charId = data.character[0];

        const charRes = await fetch(`https://esi.evetech.net/latest/characters/${charId}/?datasource=tranquility`);
        if (!charRes.ok) {
            console.error("Character fetch failed:", charRes.status);
            return null;
        }

        const charData = await charRes.json();

        const corp = corporations.find(c => c.id === charData.corporation_id);
        const alliance = alliances.find(a => a.id === charData.alliance_id);

        return {
            name: charData.name,
            corporation: corp ? corp.name : "Unknown",
            alliance: alliance ? alliance.name : "None",
            portrait: `https://images.evetech.net/characters/${charId}/portrait?size=128`
        };

    } catch (err) {
        console.error("Error fetching character:", err);
        return null;
    }
}

// Example usage
(async () => {
    await loadData();
    const player = await lookupPlayer("Erica Romero");
    if (player) console.log(player);
})();
