const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const app = express();

const db = new sqlite3.Database("./eve.db");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Lookup system by exact name
app.get("/lookup", (req, res) => {
    const name = req.query.name;
    if (!name) return res.status(400).json({ error: "Name required" });

    db.get(`
        SELECT s.name as system, s.security_status, 
               c.name as constellation, r.name as region
        FROM systems s
        LEFT JOIN constellations c ON s.constellation_id = c.id
        LEFT JOIN regions r ON s.region_id = r.id
        WHERE LOWER(s.name) = LOWER(?)
    `, [name], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "System not found" });
        res.json(row);
    });
});

// Autocomplete
app.get("/autocomplete", (req, res) => {
    const query = req.query.query;
    if (!query) return res.json([]);

    db.all(`
        SELECT name 
        FROM systems 
        WHERE LOWER(name) LIKE LOWER(?) 
        ORDER BY name 
        LIMIT 10
    `, [`%${query}%`], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map(r => r.name));
    });
});

app.listen(3000, () => console.log("Server running on port 3000"));
