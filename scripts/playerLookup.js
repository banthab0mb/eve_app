// Load JSON once
let alliances = [], corporations = [];

async function loadData() {
  alliances = await fetch("alliances.json").then(r => r.json());
  corporations = await fetch("corporations.json").then(r => r.json());
}

function searchList(list, query) {
  query = query.toLowerCase();
  return list.filter(x =>
    x.name.toLowerCase().includes(query) ||
    x.ticker.toLowerCase().includes(query)
  ).slice(0, 10); // max 10 suggestions
}

const box = document.getElementById("searchBox");
const suggestions = document.getElementById("suggestions");

box.addEventListener("input", () => {
  const q = box.value.trim();
  if (!q) {
    suggestions.innerHTML = "";
    return;
  }

  const aResults = searchList(alliances, q);
  const cResults = searchList(corporations, q);

  suggestions.innerHTML = "";

  [...aResults, ...cResults].forEach(item => {
    const li = document.createElement("li");
    li.textContent = `${item.name} [${item.ticker}]`;
    li.onclick = () => {
      box.value = item.name;
      suggestions.innerHTML = "";
    };
    suggestions.appendChild(li);
  });
});

// Initialize
loadData();