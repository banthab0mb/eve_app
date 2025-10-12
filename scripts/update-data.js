// scripts/update-data.js
import fs from "fs";
import fetch from "node-fetch";

// --- CONFIG ---
const ALLIANCE_BATCH_SIZE = 50;
const CORP_BATCH_SIZE = 50;
const BATCH_DELAY = 100;
const RETRIES = 3;

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

async function batchMap(array, batchSize, fn) {
  const results = [];
  for (let i = 0; i < array.length; i += batchSize) {
    const batch = array.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults.filter(Boolean));
    await new Promise(r => setTimeout(r, BATCH_DELAY));
  }
  return results;
}

function readJSON(file) {
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  return [];
}

function mergeUnique(existing, incoming, key = "id") {
  const map = new Map(existing.map(item => [item[key], item]));
  for (const item of incoming) {
    map.set(item[key], item);
  }
  return Array.from(map.values());
}

// --- UPDATE FUNCTION ---
async function update() {
  const existingAlliances = readJSON("alliances.json");
  const existingCorps = readJSON("corporations.json");

  const allianceIds = await getJSON("/alliances/");

  const newAlliances = await batchMap(allianceIds, ALLIANCE_BATCH_SIZE, async (id) => {
    const data = await getJSON(`/alliances/${id}/`);
    if (data) return { id, name: data.name, ticker: data.ticker };
    return null;
  });

  const allAlliances = mergeUnique(existingAlliances, newAlliances);
  fs.writeFileSync("alliances.json", JSON.stringify(allAlliances, null, 2));
  console.log(`Updated alliances count: ${allAlliances.length}`);

  const corpsNested = await batchMap(allianceIds, 10, async (aid) => {
    const corpIds = await getJSON(`/alliances/${aid}/corporations/`);
    if (!corpIds) return [];
    return batchMap(corpIds, CORP_BATCH_SIZE, async (cid) => {
      const corp = await getJSON(`/corporations/${cid}/`);
      if (corp) return { id: cid, name: corp.name, ticker: corp.ticker };
      return null;
    });
  });

  const newCorps = corpsNested.flat(2);
  const allCorps = mergeUnique(existingCorps, newCorps);
  fs.writeFileSync("corporations.json", JSON.stringify(allCorps, null, 2));
  console.log(`Updated corporations count: ${allCorps.length}`);
}

update().catch(err => {
  console.error("Update failed:", err);
  process.exit(1);
});