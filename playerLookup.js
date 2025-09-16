(() => {
// Helper: GET from EveWho
async function eveWhoGet(url) {
  const res = await fetch(`https://evewho.com/api${url}`);
  if (!res.ok) throw new Error(`EveWho API error ${res.status}: ${url}`);
  return await res.json();
}

// Lookup by name using EveWho search
async function lookupName(name) {
  // EveWho search endpoint returns array of matches
  const res = await fetch(`https://evewho.com/api/search/${encodeURIComponent(name)}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || !data.length) return null;
  // Pick the first match
  const match = data[0];
  let result = { category: match.category, id: match.id };

  if (match.category === "character") {
    const details = await eveWhoGet(`/character/${match.id}`);
    result.details = details;
    // Get corp info if available
    if (details.corporation_id) {
      result.corp = await eveWhoGet(`/corporation/${details.corporation_id}`);
    }
    // Get alliance info if available
    if (details.alliance_id) {
      result.alliance = await eveWhoGet(`/alliance/${details.alliance_id}`);
    }
  } else if (match.category === "corporation") {
    result.details = await eveWhoGet(`/corporation/${match.id}`);
  } else if (match.category === "alliance") {
    result.details = await eveWhoGet(`/alliance/${match.id}`);
  }
  return result;
}
  // Lookup by id and category using EveWho
  async function lookupByIdCategory(id, category) {
    let result = { category, id };
    if (category === "character") {
      const details = await eveWhoGet(`/character/${id}`);
      result.details = details;
      if (details.corporation_id) {
        result.corp = await eveWhoGet(`/corporation/${details.corporation_id}`);
      }
      if (details.alliance_id) {
        result.alliance = await eveWhoGet(`/alliance/${details.alliance_id}`);
      }
    } else if (category === "corporation") {
      result.details = await eveWhoGet(`/corporation/${id}`);
    } else if (category === "alliance") {
      result.details = await eveWhoGet(`/alliance/${id}`);
    }
    return result;
  }

  // Lookup by name fallback (for search button/enter)
  async function lookupName(name) {
    const res = await fetch(`https://evewho.com/api/search/${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.length) return null;
    const match = data[0];
    return await lookupByIdCategory(match.id, match.category);
  }

// Fetch autocomplete suggestions using EveWho search
async function fetchSuggestions(query) {
  if (!query || query.length < 3) return [];
  try {
    const res = await fetch(`https://evewho.com/api/search/${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    // EveWho returns array of {id, name, category}
    return data;
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
Corporation: ${corp ? `${corp.name} [${corp.ticker}] (ID: ${corp.corporation_id})` : "Unknown"}
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
    `.trim();
  }

  return JSON.stringify(result, null, 2);
}

document.addEventListener("DOMContentLoaded", function() {
  const box = document.getElementById("searchBox");
  const suggestions = document.getElementById("suggestions");
  const output = document.getElementById("output");
  const searchBtn = document.getElementById("lookupBtn");

  let corporations = [];
  let alliances = [];

  // Load local corp/alliance data
  fetch("corporations.json").then(r => r.json()).then(data => { corporations = data; });
  fetch("alliances.json").then(r => r.json()).then(data => { alliances = data; });

  async function showSuggestions(query) {
    let results = await fetchSuggestions(query.startsWith);
    if (!Array.isArray(results)) results = [];

    // Local corp/alliance suggestions
    const localResults = [];
    if (query.length >= 3) {
      // Corporations
      corporations.forEach(corp => {
        if (
          corp.name.toLowerCase().includes(query.toLowerCase()) ||
          (corp.ticker && corp.ticker.toLowerCase().includes(query.toLowerCase()))
        ) {
          localResults.push({ name: corp.name, category: "corporation", id: corp.corporation_id });
        }
      });
      // Alliances
      alliances.forEach(alli => {
        if (
          alli.name.toLowerCase().includes(query.toLowerCase()) ||
          (alli.ticker && alli.ticker.toLowerCase().includes(query.toLowerCase()))
        ) {
          localResults.push({ name: alli.name, category: "alliance", id: alli.alliance_id });
        }
      });
    }

    // Combine and deduplicate
    const allResults = [...localResults, ...results].filter((v, i, a) =>
      a.findIndex(t => t.id === v.id && t.category === v.category) === i
    );

    suggestions.innerHTML = "";
    allResults.forEach(r => {
      const li = document.createElement("li");
      li.textContent = `${r.name} (${r.category})`;
        // Attach data for direct lookup
        li._data = { id: r.id, category: r.category };
        li.onclick = async () => {
          box.value = r.name;
          suggestions.innerHTML = "";
          const fullData = await lookupByIdCategory(r.id, r.category);
          output.textContent = formatOutput(fullData);
        };
      suggestions.appendChild(li);
    });
  }

  // Input event for suggestions
  box.addEventListener("input", async () => {
    const query = box.value.trim();
    await showSuggestions(query);
  });

  // Search button click
  if (searchBtn) {
    searchBtn.addEventListener("click", async () => {
      const query = box.value.trim();
      suggestions.innerHTML = "";
      const fullData = await lookupName(query);
      output.textContent = formatOutput(fullData);
    });
  }

  // Enter key triggers search
  box.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      suggestions.innerHTML = "";
      const query = box.value.trim();
      const fullData = await lookupName(query);
      output.textContent = formatOutput(fullData);
    }
  });
});

})();