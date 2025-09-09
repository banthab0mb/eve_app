const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("systems.db");

db.all("SELECT COUNT(*) AS count FROM systems", [], (err, rows) => {
  if (err) throw err;
  console.log("Systems table row count:", rows[0].count);
  db.close();
});
