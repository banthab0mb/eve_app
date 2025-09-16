async function runEntityLookup() {
  const query = document.getElementById("lookupInput").value.trim();
  if (!query) return;

  const searchUrl = `https://esi.evetech.net/latest/search/?categories=character,corporation,alliance&strict=true&search=${encodeURIComponent(query)}&datasource=tranquility`;

  try {
    const res = await fetch(searchUrl);
    if (!res.ok) throw new Error("Search failed");
    const data = await res.json();

    // Check what category matched
    if (data.character && data.character.length > 0) {
      fetchCharacter(data.character[0]);
    } else if (data.corporation && data.corporation.length > 0) {
      fetchCorporation(data.corporation[0]);
    } else if (data.alliance && data.alliance.length > 0) {
      fetchAlliance(data.alliance[0]);
    } else {
      document.getElementById("lookupOutput").innerHTML = "<p>No results found.</p>";
    }
  } catch (err) {
    console.error(err);
    document.getElementById("lookupOutput").innerHTML = `<p>Error: ${err.message}</p>`;
  }
}

async function fetchCharacter(id) {
  const res = await fetch(`https://esi.evetech.net/latest/characters/${id}/`);
  const data = await res.json();
  document.getElementById("lookupOutput").innerHTML = `
    <h3>Character: ${data.name}</h3>
    <p>Corp ID: ${data.corporation_id}</p>
    <p>Alliance ID: ${data.alliance_id ?? "None"}</p>
    <img src="https://images.evetech.net/characters/${id}/portrait?size=128" />
  `;
}

async function fetchCorporation(id) {
  const res = await fetch(`https://esi.evetech.net/latest/corporations/${id}/`);
  const data = await res.json();
  document.getElementById("lookupOutput").innerHTML = `
    <h3>Corporation: ${data.name}</h3>
    <p>Ticker: ${data.ticker}</p>
    <p>Member Count: ${data.member_count}</p>
    <img src="https://images.evetech.net/corporations/${id}/logo?size=128" />
  `;
}

async function fetchAlliance(id) {
  const res = await fetch(`https://esi.evetech.net/latest/alliances/${id}/`);
  const data = await res.json();
  document.getElementById("lookupOutput").innerHTML = `
    <h3>Alliance: ${data.name}</h3>
    <p>Ticker: ${data.ticker}</p>
    <img src="https://images.evetech.net/alliances/${id}/logo?size=128" />
  `;
}
