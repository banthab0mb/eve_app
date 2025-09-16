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
    console.error(err);
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

// Wire up DOM
const box = document.getElementById("searchBox");
const suggestions = document.getElementById("suggestions");
const output = document.getElementById("output");

box.addEventListener("input", async () => {
  const query = box.value.trim();
  const results = await fetchSuggestions(query);

  suggestions.innerHTML = "";
  results.forEach(r => {
    const li = document.createElement("li");
    li.textContent = `${r.name} (${r.category})`;
    li.onclick = async () => {
      box.value = r.name;
      suggestions.innerHTML = "";

      const fullData = await lookupName(r.name);
      output.textContent = formatOutput(fullData);
    };
    suggestions.appendChild(li);
  });
});