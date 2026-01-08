const tableBody = document.getElementById("threatTable");

// Add headers
tableBody.innerHTML = `
  <tr>
    <th>Character</th>
    <th>Corporation</th>
    <th>Alliance</th>
    <th>Risk</th>
    <th>Kills</th>
    <th>Losses</th>
  </tr>
`;

async function analyzeNames(inputValue) {
  const names = inputValue
    .split("\n")
    .map(n => n.trim())
    .filter(n => n.length > 0);

  // Clear previous rows except headers
  tableBody.querySelectorAll("tr:not(:first-child)").forEach(r => r.remove());

  const batchSize = 10;
  let allRows = [];

  for (let i = 0; i < names.length; i += batchSize) {
    const batch = names.slice(i, i + batchSize);
    const batchRows = await Promise.all(batch.map(name => createCharacterRow(name)));
    allRows = allRows.concat(batchRows.filter(r => r));
  }

  // Sort rows by risk descending
  allRows.sort((a, b) => {
    const riskA = parseFloat(a.dataset.risk) || 0;
    const riskB = parseFloat(b.dataset.risk) || 0;
    return riskB - riskA;
  });

  // Append sorted rows
  allRows.forEach(row => tableBody.appendChild(row));
  tableBody.style.display = "table";
}

async function createCharacterRow(name) {
  try {
    const res = await fetch("https://esi.evetech.net/latest/universe/ids/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([name])
    });
    if (!res.ok) throw new Error(`universe/ids failed: ${res.status}`);
    const data = await res.json();
    const charEntry = data.characters?.[0];
    if (!charEntry) throw new Error(`Character not found: ${name}`);

    const charId = charEntry.id;
    const charData = await (await fetch(`https://esi.evetech.net/latest/characters/${charId}/`)).json();

    // Corporation
    let corpName = "—", corpLogo = "", corpAllianceId = null;
    if (charData.corporation_id) {
      const corpData = await (await fetch(`https://esi.evetech.net/latest/corporations/${charData.corporation_id}/`)).json();
      corpName = corpData.name || "—";
      corpLogo = `https://images.evetech.net/corporations/${charData.corporation_id}/logo`;
      corpAllianceId = corpData.alliance_id || null;
    }

    // Alliance
    let allianceName = "—", allianceLogo = "";
    if (charData.alliance_id || corpAllianceId) {
      const allianceId = charData.alliance_id || corpAllianceId;
      const allianceData = await (await fetch(`https://esi.evetech.net/latest/alliances/${allianceId}/`)).json();
      allianceName = allianceData.name || "—";
      allianceLogo = `https://images.evetech.net/alliances/${allianceId}/logo`;
    }

    // zKillboard stats (limit parallel fetches)
    let kills = 0, losses = 0;
    try {
      await new Promise(r => setTimeout(r, 100)); // 100ms delay per fetch
      const zkillRes = await fetch(`https://zkillboard.com/api/stats/characterID/${charId}/`, {
        headers: { "Accept-Encoding": "gzip", "User-Agent": "https://banthab0mb.github.io/eve_app/ Maintainer: banthab0mb@gmail.com" }
      });
      const zkillData = await zkillRes.json();
      kills = zkillData?.shipsDestroyed || 0;
      losses = zkillData?.shipsLost || 0;
    } catch {}

    const risk = kills + losses === 0 ? 0 : ((kills / (kills + losses)) * 100).toFixed(1);
    const portrait = `https://images.evetech.net/characters/${charId}/portrait`;
    const properName = charData.name
      .split(" ")
      .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(" ");

    const row = document.createElement("tr");
    row.dataset.risk = risk;
    const lookupBase = "https://banthab0mb.github.io/eve_app/lookup.html?q=";

    row.innerHTML = `
    <td>
        <img src="${portrait}" width="64" height="64" style="vertical-align:middle"> 
        <a href="${lookupBase}${encodeURIComponent(properName)}" target="_blank">${properName}</a>
    </td>
    <td>
        ${corpLogo ? `<img src="${corpLogo}" width="64" height="64" style="vertical-align:middle"> ` : ""}
        ${corpName !== "—" ? `<a href="${lookupBase}${encodeURIComponent(corpName)}" target="_blank">${corpName}</a>` : corpName}
    </td>
    <td>
        ${allianceLogo ? `<img src="${allianceLogo}" width="64" height="64" style="vertical-align:middle"> ` : ""}
        ${allianceName !== "—" ? `<a href="${lookupBase}${encodeURIComponent(allianceName)}" target="_blank">${allianceName}</a>` : allianceName}
    </td>
    <td>${risk}%</td>
    <td>${kills}</td>
    <td>${losses}</td>
    `;

    return row;

  } catch (err) {
    console.error(err);
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="6">Error loading "${name}"</td>`;
    return row;
  }
}
