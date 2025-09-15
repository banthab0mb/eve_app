// scripts/update-data.js
import fs from "fs";
import fetch from "node-fetch";

async function getJSON(url) {
  const res = await fetch(`https://esi.evetech.net/latest${url}`);
  if (!res.ok) throw new Error(`ESI error ${res.status}: ${url}`);
  return res.json();
}

async function update() {
  // Alliances
  const allianceIds = await getJSON("/alliances/");
  const alliances = [];
  for (let id of allianceIds) {
    const data = await getJSON(`/alliances/${id}/`);
    alliances.push({ id, name: data.name, ticker: data.ticker });
  }
  fs.writeFileSync("alliances.json", JSON.stringify(alliances, null, 2));
  console.log(`✅ Updated ${alliances.length} alliances`);

  // Corporations (from alliances only)
  const corps = [];
  for (let aid of allianceIds) {
    try {
      const corpIds = await getJSON(`/alliances/${aid}/corporations/`);
      for (let cid of corpIds) {
        try {
          const corp = await getJSON(`/corporations/${cid}/`);
          corps.push({ id: cid, name: corp.name, ticker: corp.ticker });
        } catch {
          console.warn(`⚠️ Failed to fetch corp ${cid}`);
        }
      }
    } catch {
      console.warn(`⚠️ Failed to fetch corporations for alliance ${aid}`);
    }
  }

  fs.writeFileSync("corporations.json", JSON.stringify(corps, null, 2));
  console.log(`✅ Updated ${corps.length} corporations`);
}

update().catch(err => {
  console.error("❌ Update failed:", err);
  process.exit(1);
});
