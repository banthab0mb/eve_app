// alliances + corporations
let alliances = [], corporations = [];

// preload data
async function loadData() {
  try {
    alliances = await fetch("alliances.json").then(r => r.json());
    corporations = await fetch("corporations.json").then(r => r.json());
    console.log("Loaded alliances + corporations");
  } catch (err) {
    console.error("Failed to load JSON files", err);
  }
}

function searchList(list, query) {
  query = query.toLowerCase();
  return list.filter(x =>
    x.name.toLowerCase().includes(query) ||
    x.ticker.toLowerCase().includes(query)
  ).slice(0, 10);
}

const box = document.getElementById("searchBox");
const suggestions = document.getElementById("suggestions");
const output = document.getElementById("output");

// build suggestions as you type
box.addEventListener("input", () => {
  const q = box.value.trim().toLowerCase();
  suggestions.innerHTML = "";
  if (!q) return;

  const aResults = searchList(alliances, q);
  const cResults = searchList(corporations, q);

  [...aResults, ...cResults].forEach(item => {
    const li = document.createElement("li");
    li.textContent = `${item.name} [${item.ticker}]`;
    li.onclick = () => runLookup(item.name, item.type || (corporations.includes(item) ? "corp" : "alliance"));
    suggestions.appendChild(li);
  });

  // if no corp/alliance matches, allow character lookup
  const charLi = document.createElement("li");
  charLi.textContent = `Search characters for "${box.value}"`;
  charLi.style.fontStyle = "italic";
  charLi.onclick = () => runLookup(box.value, "character");
  suggestions.appendChild(charLi);
});

// allow pressing Enter
box.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    runLookup(box.value.trim(), "auto");
    suggestions.innerHTML = "";
  }
});

async function runLookup(query, type) {
  if (!query) return;
  output.innerHTML = `<p>Looking up <b>${query}</b>...</p>`;

  try {
    // alliance
    if (type === "alliance" || (type === "auto" && alliances.some(a => a.name.toLowerCase() === query.toLowerCase()))) {
      const alliance = alliances.find(a => a.name.toLowerCase() === query.toLowerCase());
      output.innerHTML = `
        <h3>Alliance</h3>
        <p><b>Name:</b> ${alliance.name}</p>
        <p><b>Ticker:</b> [${alliance.ticker}]</p>
        <p><b>ID:</b> ${alliance.id}</p>
      `;
      return;
    }

    // corporation
    if (type === "corp" || (type === "auto" && corporations.some(c => c.name.toLowerCase() === query.toLowerCase()))) {
      const corp = corporations.find(c => c.name.toLowerCase() === query.toLowerCase());
      output.innerHTML = `
        <h3>Corporation</h3>
        <p><b>Name:</b> ${corp.name}</p>
        <p><b>Ticker:</b> [${corp.ticker}]</p>
        <p><b>ID:</b> ${corp.id}</p>
      `;
      return;
    }

    // character (via ESI)
    const searchRes = await fetch(`https://esi.evetech.net/latest/search/?categories=character&strict=true&search=${encodeURIComponent(query)}`)
      .then(r => r.json());

    if (!searchRes.character || !searchRes.character.length) {
      output.innerHTML = `<p>No character found for "${query}".</p>`;
      return;
    }

    const charId = searchRes.character[0];
    const charInfo = await fetch(`https://esi.evetech.net/latest/characters/${charId}/`).then(r => r.json());
    const portrait = `https://images.evetech.net/characters/${charId}/portrait`;

    // fetch corp + alliance names
    let corpName = "Unknown", allianceName = "";
    if (charInfo.corporation_id) {
      const corpInfo = await fetch(`https://esi.evetech.net/latest/corporations/${charInfo.corporation_id}/`).then(r => r.json());
      corpName = corpInfo.name;
      if (corpInfo.alliance_id) {
        const allianceInfo = await fetch(`https://esi.evetech.net/latest/alliances/${corpInfo.alliance_id}/`).then(r => r.json());
        allianceName = allianceInfo.name;
      }
    }

    output.innerHTML = `
      <h3>Character</h3>
      <img src="${portrait}" alt="portrait">
      <p><b>Name:</b> ${charInfo.name}</p>
      <p><b>Corporation:</b> ${corpName}</p>
      ${allianceName ? `<p><b>Alliance:</b> ${allianceName}</p>` : ""}
      <p><b>ID:</b> ${charId}</p>
    `;
  } catch (err) {
    console.error(err);
    output.innerHTML = `<p>Lookup failed. Check console.</p>`;
  }
}

// start
loadData();