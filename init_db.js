const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./systems.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS regions (
      id INTEGER PRIMARY KEY,
      name TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS constellations (
      id INTEGER PRIMARY KEY,
      name TEXT,
      region_id INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS systems (
      id INTEGER PRIMARY KEY,
      name TEXT,
      constellation_id INTEGER,
      region_id INTEGER,
      security_status REAL
    )
  `);
});

console.log("Tables created.");
db.close();
