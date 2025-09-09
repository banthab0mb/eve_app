const sqlite3 = require("sqlite3").verbose();
const fetch = require("node-fetch"); // npm install node-fetch@2
const db = new sqlite3.Database("./systems.db");

(async () => {
    // Fetch all region IDs
    const regionsResp = await fetch("https://esi.evetech.net/latest/universe/regions/");
    const regionIds = await regionsResp.json();

    for (const regionId of regionIds) {
        const regData = await fetch(`https://esi.evetech.net/latest/universe/regions/${regionId}/`);
        const reg = await regData.json();
        db.run("INSERT OR IGNORE INTO regions (id, name) VALUES (?, ?)", [reg.id, reg.name]);
    }

    // Fetch all constellations
    const constResp = await fetch("https://esi.evetech.net/latest/universe/constellations/");
    const constIds = await constResp.json();

    for (const constId of constIds) {
        const cDataResp = await fetch(`https://esi.evetech.net/latest/universe/constellations/${constId}/`);
        const cData = await cDataResp.json();
        db.run(
            "INSERT OR IGNORE INTO constellations (id, name, region_id) VALUES (?, ?, ?)",
            [cData.id, cData.name, cData.region_id]
        );
    }

    // Fetch all systems
    const systemsResp = await fetch("https://esi.evetech.net/latest/universe/systems/");
    const systemIds = await systemsResp.json();

    for (const sysId of systemIds) {
        const sResp = await fetch(`https://esi.evetech.net/latest/universe/systems/${sysId}/`);
        const sData = await sResp.json();
        db.run(
            "INSERT OR IGNORE INTO systems (id, name, constellation_id, region_id, security_status) VALUES (?, ?, ?, ?, ?)",
            [sData.system_id, sData.name, sData.constellation_id, sData.region_id || 0, sData.security_status]
        );
    }

    console.log("Database populated!");
    db.close();
})();
