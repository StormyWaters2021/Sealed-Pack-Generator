const state = {
  games: [],
  kind: "case",
  result: null,
  openedPacks: new Map(),
  newModelIds: new Set(),
};

const el = (id) => document.getElementById(id);
const setSelect = el("setSelect");
const generateBtn = el("generateBtn");
const codeInput = el("codeInput");
const openCodeBtn = el("openCodeBtn");
const resultView = el("resultView");
const emptyState = el("emptyState");
const openingPanel = document.querySelector(".opening-panel");
const pullsPanel = document.querySelector(".pulls-panel");
const resultTitle = el("resultTitle");
const resultCode = el("resultCode");
const hierarchy = el("hierarchy");
const pullList = el("pullList");
const pullsEmpty = el("pullsEmpty");
const pullCount = el("pullCount");
const downloadArea = el("downloadArea");
const downloadO8dBtn = el("downloadO8dBtn");
const themeToggle = el("themeToggle");
const toast = el("toast");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function syncPullsPanelHeight() {
  if (!openingPanel || !pullsPanel) return;

  if (window.innerWidth <= 1080) {
    pullsPanel.style.height = "";
    return;
  }

  pullsPanel.style.height = `${openingPanel.getBoundingClientRect().height}px`;
}

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

function shortSetName(name) {
  const value = String(name || "");
  const colon = value.lastIndexOf(":");
  return colon >= 0 ? value.slice(colon + 1).trim() : value;
}

async function loadSets() {
  const data = await api("/api/sets");
  state.games = data.games || [];

  const options = [];

  for (const game of state.games) {
    for (const set of game.sets || []) {
      options.push(
        `<option value="${escapeHtml(game.id)}::${escapeHtml(set.id)}">${escapeHtml(shortSetName(set.name))}</option>`
      );
    }
  }

  setSelect.innerHTML = options.join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setKind(kind) {
  state.kind = kind;

  document.querySelectorAll("#kindPicker button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.kind === kind);
  });

  generateBtn.textContent = `Generate ${kind}`;
}

function applyTheme(theme, save = true) {
  const normalized = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = normalized;

  const dark = normalized === "dark";
  themeToggle.textContent = dark ? "☀️" : "🌙";
  themeToggle.setAttribute(
    "aria-label",
    dark ? "Switch to light mode" : "Switch to dark mode"
  );
  themeToggle.title = dark ? "Switch to light mode" : "Switch to dark mode";

  if (save) {
    localStorage.setItem("pack-generator-theme", normalized);
  }
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme || "light";
  applyTheme(current === "dark" ? "light" : "dark");
}

async function generate() {
  generateBtn.disabled = true;
  generateBtn.textContent = "Generating…";

  try {
    const [game, set] = setSelect.value.split("::");

    const data = await api("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game,
        set,
        kind: state.kind,
      }),
    });

    render(data);
  } catch (error) {
    showToast(error.message);
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = `Generate ${state.kind}`;
  }
}

async function openCode(code) {
  const value = (code || codeInput.value).trim();
  if (!value) return;

  openCodeBtn.disabled = true;

  try {
    const data = await api(`/api/open?code=${encodeURIComponent(value)}`);
    render(data);
  } catch (error) {
    showToast(error.message);
  } finally {
    openCodeBtn.disabled = false;
  }
}

function groupLabel(card) {
  if (card.category === "one_shot") return "One-Shot";
  if (card.category === "terrain") return "Terrain";
  if (card.prime) return `Prime · ${card.rarity}`;
  if (card.rarity === "Chase") return "Chase";

  if (card.rarity === "Super Rare" && card.unit_type === "Equipment") {
    return "Super Rare Equipment";
  }

  if (card.rarity === "Super Rare") return "Super Rare";
  if (card.rarity === "Rare") return "Rare";
  if (card.rarity === "Uncommon") return "Uncommon";
  if (card.rarity === "Common") return "Common";

  return card.rarity || card.unit_type || "Other";
}

const groupOrder = [
  "Prime · Super Rare",
  "Prime · Rare",
  "Chase",
  "Super Rare",
  "Super Rare Equipment",
  "Rare",
  "Uncommon",
  "Common",
  "One-Shot",
  "Terrain",
];

function packCards(pack) {
  return [...pack.cards, ...(pack.extras || [])];
}

function currentCards() {
  return [...state.openedPacks.values()].flatMap(packCards);
}

function renderPulls() {
  const cards = currentCards();
  pullCount.textContent = String(cards.length);

  const byGroup = new Map();

  for (const card of cards) {
    const group = groupLabel(card);

    if (!byGroup.has(group)) {
      byGroup.set(group, new Map());
    }

    const key = card.model_id;
    const existing = byGroup.get(group).get(key) || {
      card,
      qty: 0,
    };

    existing.qty++;
    byGroup.get(group).set(key, existing);
  }

  const groups = [...byGroup.keys()].sort((a, b) => {
    const ai = groupOrder.indexOf(a);
    const bi = groupOrder.indexOf(b);

    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;

    return ai - bi;
  });

  let html = "";

  for (const group of groups) {
    const items = [...byGroup.get(group).values()].sort((a, b) =>
      (a.card.collector_number || "").localeCompare(
        b.card.collector_number || "",
        undefined,
        { numeric: true }
      ) || a.card.name.localeCompare(b.card.name)
    );

    html += `<div class="pull-group">
      <div class="pull-group-title">${escapeHtml(group)}</div>`;

    for (const item of items) {
      const isNew = state.newModelIds.has(item.card.model_id);

      html += `<div class="pull-item${isNew ? " is-new" : ""}">
        <span class="pull-qty">${item.qty}×</span>
        <span>${escapeHtml(item.card.name)}</span>
        <span class="pull-number">${escapeHtml(item.card.collector_number)}</span>
      </div>`;
    }

    html += `</div>`;
  }

  const hasCards = cards.length > 0;

  pullsEmpty.classList.toggle("hidden", hasCards);
  pullList.classList.toggle("hidden", !hasCards);
  downloadArea.classList.toggle("hidden", !hasCards);
  pullList.innerHTML = html;
}

function packCodeFor(brickIndex, packIndex) {
  return `${state.result.case_code}-B${brickIndex}-P${String(packIndex).padStart(2, "0")}`;
}

function getPack(brickIndex, packIndex) {
  const brick = state.result?.generated_case?.bricks?.find(
    (item) => item.brick_index === brickIndex
  );

  if (!brick) return null;

  return brick.boosters.find(
    (item) => item.booster_index === packIndex
  ) || null;
}

function openPack(brickIndex, packIndex) {
  if (!state.result) return;

  const code = packCodeFor(brickIndex, packIndex);

  if (state.openedPacks.has(code)) {
    return;
  }

  const pack = getPack(brickIndex, packIndex);

  if (!pack) {
    showToast("That pack could not be found in this product.");
    return;
  }

  state.newModelIds = new Set(
    packCards(pack).map((card) => card.model_id)
  );

  state.openedPacks.set(code, pack);

  renderHierarchy(state.result);
  renderPulls();
}

function renderPackDetail(pack, packCodeValue) {
  const all = packCards(pack);

  return `<div class="pack-detail">
    <div class="pack-detail-header">
      <strong>Pack ${pack.booster_index}</strong>
      <div class="mini-code">${escapeHtml(packCodeValue)}</div>
    </div>
    ${all.map((card) => `
      <div class="card-row">
        <span class="collector">${escapeHtml(card.collector_number)}</span>
        <span class="card-name">${escapeHtml(card.name)}</span>
        <span class="rarity-chip">${escapeHtml(groupLabel(card))}</span>
      </div>
    `).join("")}
  </div>`;
}

function renderBrick(brick, caseCodeValue) {
  const brickCodeValue = `${caseCodeValue}-B${brick.brick_index}`;

  const packs = brick.boosters.map((pack) => {
    const code = `${brickCodeValue}-P${String(pack.booster_index).padStart(2, "0")}`;
    const opened = state.openedPacks.has(code);

    return `<button
      class="pack-button${opened ? " opened" : ""}"
      type="button"
      data-brick-index="${brick.brick_index}"
      data-pack-index="${pack.booster_index}"
      title="${escapeHtml(code)}"
      ${opened ? "disabled" : ""}
    >
      <strong>Pack ${pack.booster_index}</strong>
      ${opened ? '<span class="opened-label">Opened</span>' : ""}
    </button>`;
  }).join("");

  return `<div class="brick-card">
    <div class="brick-header">
      <h3>Brick ${brick.brick_index}</h3>
      <div class="mini-code">${escapeHtml(brickCodeValue)}</div>
    </div>
    <div class="pack-grid">${packs}</div>
  </div>`;
}

function renderHierarchy(result) {
  if (result.kind === "pack") {
    hierarchy.innerHTML = renderPackDetail(result.selected, result.code);
    return;
  }

  if (result.kind === "brick") {
    hierarchy.innerHTML = renderBrick(result.selected, result.case_code);
    return;
  }

  hierarchy.innerHTML = result.selected.bricks
    .map((brick) => renderBrick(brick, result.case_code))
    .join("");
}

function resetOpenedState(result) {
  state.openedPacks = new Map();
  state.newModelIds = new Set();

  if (result.kind === "pack") {
    state.openedPacks.set(result.code, result.selected);

    for (const card of packCards(result.selected)) {
      state.newModelIds.add(card.model_id);
    }
  }
}

function render(result) {
  state.result = result;
  resetOpenedState(result);

  emptyState.classList.add("hidden");
  resultView.classList.remove("hidden");

  const productName =
    result.kind[0].toUpperCase() + result.kind.slice(1);

  resultTitle.textContent = `${shortSetName(result.set.name)} ${productName}`;
  resultCode.textContent = result.code;
  codeInput.value = result.code;

  const url = new URL(window.location.href);
  url.searchParams.set("code", result.code);
  history.replaceState(null, "", url);

  renderHierarchy(result);
  renderPulls();
  requestAnimationFrame(syncPullsPanelHeight);
}

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function downloadO8d() {
  const result = state.result;

  if (!result?.integrations?.octgn?.game_id) {
    showToast("This game does not have OCTGN export configured.");
    return;
  }

  const cards = currentCards();

  if (!cards.length) {
    showToast("Open at least one pack first.");
    return;
  }

  const grouped = new Map();

  for (const card of cards) {
    const existing = grouped.get(card.model_id) || {
      card,
      qty: 0,
    };

    existing.qty++;
    grouped.set(card.model_id, existing);
  }

  const lines = [
    '<?xml version="1.0" encoding="utf-8" standalone="yes"?>',
    `<!-- Sealed Pool Code: ${result.code} -->`,
    `<deck game="${xmlEscape(result.integrations.octgn.game_id)}" sleeveid="0">`,
    `  <section name="${xmlEscape(result.integrations.octgn.default_section || "Team")}" shared="False">`,
  ];

  for (const { card, qty } of grouped.values()) {
    lines.push(
      `    <card qty="${qty}" id="${xmlEscape(card.model_id)}">${xmlEscape(card.name)}</card>`
    );
  }

  lines.push("  </section>");
  lines.push("</deck>");

  const blob = new Blob(
    [lines.join("\n") + "\n"],
    { type: "application/xml;charset=utf-8" }
  );

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${result.code}.o8d`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

document.querySelectorAll("#kindPicker button").forEach((btn) => {
  btn.addEventListener("click", () => setKind(btn.dataset.kind));
});

generateBtn.addEventListener("click", generate);
openCodeBtn.addEventListener("click", () => openCode());

codeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    openCode();
  }
});

el("copyCodeBtn").addEventListener("click", async () => {
  if (!state.result) return;

  await navigator.clipboard.writeText(state.result.code);
  showToast("Share code copied");
});

hierarchy.addEventListener("click", (event) => {
  const button = event.target.closest("[data-brick-index][data-pack-index]");

  if (!button || button.disabled) return;

  openPack(
    Number(button.dataset.brickIndex),
    Number(button.dataset.packIndex)
  );
});

downloadO8dBtn.addEventListener("click", downloadO8d);
themeToggle.addEventListener("click", toggleTheme);

if (typeof ResizeObserver !== "undefined" && openingPanel) {
  const panelObserver = new ResizeObserver(() => {
    syncPullsPanelHeight();
  });
  panelObserver.observe(openingPanel);
}

window.addEventListener("resize", syncPullsPanelHeight);

(async function init() {
  try {
    applyTheme(
      document.documentElement.dataset.theme === "dark" ? "dark" : "light",
      false
    );

    await loadSets();
    setKind("case");
    requestAnimationFrame(syncPullsPanelHeight);

    const code = new URL(window.location.href).searchParams.get("code");

    if (code) {
      codeInput.value = code;
      await openCode(code);
    }
  } catch (error) {
    showToast(error.message);
  }
})();
