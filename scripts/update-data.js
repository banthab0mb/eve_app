// scripts/update-data.js
import fs from "fs";
import fetch from "node-fetch";

// --- CONFIG ---
const ALLIANCE_BATCH_SIZE = 50;  // alliances per batch
const CORP_BATCH_SIZE = 50;      // corps per batch
const BATCH_DELAY = 100;         // ms delay between batches
const RETRIES = 3;               // retry failed requests

// --- HELPERS ---
async function getJSON(url, attempt = 1) {
  try {
    const res = await fetch(`https://esi.evetech.net/latest${url}`);
    if (!res.ok) throw new Error(`ESI error ${res.status}: ${url}`);
    return res.json();
  } catch (err) {
    if (attempt <= RETRIES) {
      console.warn(`Retry ${attempt} for ${url}`);
      await new Promise(r => setTimeout(r, 200 * attempt));
      return getJSON(url, attempt + 1);
    }
    console.error(`Failed after ${RETRIES} retries: ${url}`);
    return null;
  }
}

// Batch processing helper
async function batchMap(array, batchSize, fn) {
  const results = [];
  for (let i = 0; i < array.length; i += batchSize) {
    const batch = array.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults.filter(Boolean));
    await new Promise(r => setTimeout(r, BATCH_DELAY)); // delay between batches
  }
  return results;
}

// --- UPDATE FUNCTION ---
async function update() {
  console.log("Fetching alliance IDs...");
  const allianceIds = await getJSON("/alliances/");

  console.log(`Fetching ${allianceIds.length} alliances in batches...`);
  const alliances = await batchMap(allianceIds, ALLIANCE_BATCH_SIZE, async (id) => {
    const data = await getJSON(`/alliances/${id}/`);
    if (data) return { id, name: data.name, ticker: data.ticker };
    return null;
  });

  fs.writeFileSync("alliances.json", JSON.stringify(alliances, null, 2));
  console.log(`Updated ${alliances.length} alliances`);

  console.log("Fetching corporations per alliance in batches...");
  const corpsNested = await batchMap(allianceIds, 10, async (aid) => { // smaller batches for corp fetch
    const corpIds = await getJSON(`/alliances/${aid}/corporations/`);
    if (!corpIds) return [];

    return batchMap(corpIds, CORP_BATCH_SIZE, async (cid) => {
      const corp = await getJSON(`/corporations/${cid}/`);
      if (corp) return { id: cid, name: corp.name, ticker: corp.ticker };
      return null;
    });
  });

  const corps = corpsNested.flat(2); // flatten nested arrays
  fs.writeFileSync("corporations.json", JSON.stringify(corps, null, 2));
  console.log(`Updated ${corps.length} corporations`);
}

update().catch(err => {
  console.error("Update failed:", err);
  process.exit(1);
});