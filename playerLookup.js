// Load JSON once
let alliances = [], corporations = [];

async function loadData() {
  alliances = await fetch("alliances.json").then(r => r.json());
  corporations = await fetch("corporations.json").then(r => r.json());
}

function searchList(list, query) {
  query = query.toLowerCase();
  return list.filter(x =>
    x.name.toLowerCase().includes(query) ||
    x.ticker.toLowerCase().includes(query)
  ).slice(0, 10); // max 10 suggestions
}

const box = document.getElementById("searchBox");
const suggestions = document.getElementById("suggestions");
const results = document.getElementById("output");

// --- Player lookup ---
async function searchPlayer(name) {
  const search = await fetch(
    `https://esi.evetech.net/latest/search/?categories=character&search=${encodeURIComponent(name)}&strict=true`
  ).then(r => r.json());

  if (!search.character) return null;
  const charId = search.character[0];

  const charInfo = await fetch(
    `https://esi.evetech.net/latest/characters/${charId}/`
  ).then(r => r.json());

  const corpInfo = await fetch(
    `https://esi.evetech.net/latest/corporations/${charInfo.corporation_id}/`
  ).then(r => r.json());

  let allianceInfo = null;
  if (charInfo.alliance_id) {
    allianceInfo = await fetch(
      `https://esi.evetech.net/latest/alliances/${charInfo.alliance_id}/`
    ).then(r => r.json());
  }

  return {
    id: charId,
    name: charInfo.name,
    portrait: `https://images.evetech.net/characters/${charId}/portrait`,
    corporation: { id: charInfo.corporation_id, ...corpInfo },
    alliance: allianceInfo
  };
}

// --- Render player ---
function renderPlayer(player) {
  results.innerHTML = `
    <div class="player-card">
      <img src="${player.portrait}" alt="${player.name}">
      <h2>${player.name}</h2>
      <p><b>Corporation:</b> ${player.corporation.name} [${player.corporation.ticker}]</p>
      ${player.alliance ? `<p><b>Alliance:</b> ${player.alliance.name} [${player.alliance.ticker}]</p>` : ""}
    </div>
  `;
}

// --- Handle input suggestions ---
box.addEventListener("input", () => {
  const q = box.value.trim();
  if (!q) {
    suggestions.innerHTML = "";
    return;
  }

  const aResults = searchList(alliances, q);
  const cResults = searchList(corporations, q);

  suggestions.innerHTML = "";

  [...aResults, ...cResults].forEach(item => {
    const li = document.createElement("li");
    li.textContent = `${item.name} [${item.ticker}]`;
    li.onclick = () => {
      box.value = item.name;
      suggestions.innerHTML = "";
      results.innerHTML = `<h2>${item.name} [${item.ticker}]</h2>`;
    };
    suggestions.appendChild(li);
  });
});

// --- Handle Enter key ---
box.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    const q = box.value.trim();
    if (!q) return;

    // 1. Try alliances/corps
    const aResults = searchList(alliances, q);
    const cResults = searchList(corporations, q);

    if (aResults.length > 0) {
      results.innerHTML = `<h2>${aResults[0].name} [${aResults[0].ticker}]</h2>`;
      return;
    }
    if (cResults.length > 0) {
      results.innerHTML = `<h2>${cResults[0].name} [${cResults[0].ticker}]</h2>`;
      return;
    }

    // 2. Try player lookup
    results.innerHTML = `<p>Searching for player...</p>`;
    try {
      const player = await searchPlayer(q);
      if (player) {
        renderPlayer(player);
      } else {
        results.innerHTML = `<p>No player found for "${q}"</p>`;
      }
    } catch (err) {
      results.innerHTML = `<p>Error looking up player</p>`;
      console.error(err);
    }
  }
});

// Initialize
loadData();