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

// Lookup full info
async function lookupName(name) {
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
    return { category, id, details, corp, alliance };
  }

  return { category, id, details };
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

// Wire up DOM
const box = document.getElementById("searchBox");
const output = document.getElementById("output");

// When user presses Enter in search box
box.addEventListener("keypress", async (e) => {
  if (e.key === "Enter") {
    const query = box.value.trim();
    if (!query) return;

    output.textContent = "Searching...";
    const result = await lookupName(query);
    output.textContent = formatOutput(result);
  }
});