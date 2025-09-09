const API_BASE = "https://eve-app.onrender.com"; // Render URL

const input = document.getElementById("systemName");
const suggestionsDiv = document.getElementById("suggestions");
const lookupBtn = document.getElementById("lookupBtn");
const outputDiv = document.getElementById("output");

// Autocomplete
input.addEventListener("input", async () => {
    const query = input.value.trim();
    if (!query) {
        suggestionsDiv.innerHTML = "";
        return;
    }

    try {
        const resp = await fetch(`${API_BASE}/autocomplete?query=${encodeURIComponent(query)}`);
        const suggestions = await resp.json();
        suggestionsDiv.innerHTML = suggestions
            .map(name => `<div class="suggestion">${name}</div>`)
            .join("");

        document.querySelectorAll(".suggestion").forEach(el => {
            el.addEventListener("click", () => {
                input.value = el.textContent;
                suggestionsDiv.innerHTML = "";
            });
        });
    } catch (err) {
        console.error("Autocomplete error:", err);
    }
});

// Lookup
lookupBtn.addEventListener("click", async () => {
    const name = input.value.trim();
    if (!name) return;

    outputDiv.innerHTML = "Loading...";

    try {
        const resp = await fetch(`${API_BASE}/lookup?name=${encodeURIComponent(name)}`);
        const data = await resp.json();

        if (data.error) {
            outputDiv.innerHTML = `<p>${data.error}</p>`;
            return;
        }

        outputDiv.innerHTML = `
            <p><b>Name:</b> ${data.system}</p>
            <p><b>Constellation:</b> ${data.constellation}</p>
            <p><b>Region:</b> ${data.region}</p>
            <p><b>Security Status:</b> ${data.security_status.toFixed(1)}</p>
        `;
    } catch (err) {
        outputDiv.innerHTML = `<p>Error fetching system info.</p>`;
        console.error("Lookup error:", err);
    }
});
