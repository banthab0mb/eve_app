const input = document.getElementById("systemName");
const suggestionsDiv = document.getElementById("suggestions");
const lookupBtn = document.getElementById("lookupBtn");
const outputDiv = document.getElementById("output");

input.addEventListener("input", async () => {
    const query = input.value.trim();
    if (!query) {
        suggestionsDiv.innerHTML = "";
        return;
    }

    const resp = await fetch(`/autocomplete?query=${encodeURIComponent(query)}`);
    const suggestions = await resp.json();
    suggestionsDiv.innerHTML = suggestions.map(name => `<div class="suggestion">${name}</div>`).join("");
});

lookupBtn.addEventListener("click", async () => {
    const name = input.value.trim();
    if (!name) return;

    const resp = await fetch(`/lookup?name=${encodeURIComponent(name)}`);
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
});
