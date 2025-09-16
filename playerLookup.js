// Lookup a player/corp/alliance by name
async function lookupEntity(name) {
  try {
    const res = await fetch(
      `https://esi.evetech.net/latest/search/?categories=character,corporation,alliance&search=${encodeURIComponent(name)}&strict=true`
    );

    if (res.status === 404) {
      console.log("No matches found.");
      return null;
    }
    const data = await res.json();

    // Character
    if (data.character?.length) {
      const id = data.character[0];
      const char = await esiGet(`/characters/${id}/`);

      // fetch corp/alliance details if available
      const corp = char.corporation_id
        ? await esiGet(`/corporations/${char.corporation_id}/`)
        : null;
      const alliance = char.alliance_id
        ? await esiGet(`/alliances/${char.alliance_id}/`)
        : null;

      return {
        category: "character",
        id,
        details: char,
        corp,
        alliance
      };
    }

    // Corporation
    if (data.corporation?.length) {
      const id = data.corporation[0];
      const corp = await esiGet(`/corporations/${id}/`);
      return {
        category: "corporation",
        id,
        details: corp
      };
    }

    // Alliance
    if (data.alliance?.length) {
      const id = data.alliance[0];
      const alliance = await esiGet(`/alliances/${id}/`);
      return {
        category: "alliance",
        id,
        details: alliance
      };
    }

    return null;
  } catch (err) {
    console.error("Lookup error:", err);
    return null;
  }
}

// Hook into your UI (like runLookup)
async function runEntityLookup() {
  const name = input.value.trim();
  if (!name) return;

  outputDiv.innerHTML = `<p>Searching for <b>${escapeHtml(name)}</b>...</p>`;

  try {
    const result = await lookupEntity(name);
    outputDiv.innerHTML = `<pre>${formatOutput(result)}</pre>`;
  } catch (err) {
    console.error(err);
    outputDiv.innerHTML = "<p>Error during lookup. See console.</p>";
  }
}

// attach button
lookupBtn.addEventListener("click", runEntityLookup);
