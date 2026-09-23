const state = {
  games: [],
  kind: "case",
  result: null,
};

const el = (id) => document.getElementById(id);
const setSelect = el("setSelect");
const generateBtn = el("generateBtn");
const codeInput = el("codeInput");
const openCodeBtn = el("openCodeBtn");
const resultView = el("resultView");
const emptyState = el("emptyState");
const resultKind = el("resultKind");
const resultTitle = el("resultTitle");
const resultCode = el("resultCode");
const hierarchy = el("hierarchy");
const pullList = el("pullList");
const pullsEmpty = el("pullsEmpty");
const pullCount = el("pullCount");
const downloadArea = el("downloadArea");
const downloadO8dBtn = el("downloadO8dBtn");
const toast = el("toast");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

async function loadSets() {
  const data = await api("/api/sets");
  state.games = data.games || [];

  const options = [];
  for (const game of state.games) {
    for (const set of game.sets || []) {
      options.push(
        `<option value="${escapeHtml(game.id)}::${escapeHtml(set.id)}">${escapeHtml(game.name)} — ${escapeHtml(set.name)}</option>`
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

function shareUrlFor(code) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("code", code);
  return url.toString();
}

async function generate() {
  generateBtn.disabled = true;
  generateBtn.textContent = "Generating…";
  try {
    const data = await api("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game: setSelect.value.split("::")[0],
        set: setSelect.value.split("::")[1],
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

function currentCards(result) {
  if (!result) return [];

  if (result.kind === "pack") {
    return [...result.selected.cards, ...(result.selected.extras || [])];
  }

  if (result.kind === "brick") {
    return result.selected.boosters.flatMap((p) => [...p.cards, ...(p.extras || [])]);
  }

  return result.selected.bricks.flatMap((b) =>
    b.boosters.flatMap((p) => [...p.cards, ...(p.extras || [])])
  );
}

function groupLabel(card) {
  if (card.category === "one_shot") return "One-Shot";
  if (card.category === "terrain") return "Terrain";
  if (card.prime) return `Prime · ${card.rarity}`;
  if (card.rarity === "Chase") return "Chase";
  if (card.rarity === "Super Rare" && card.unit_type === "Equipment") return "Super Rare Equipment";
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

function renderPulls(result) {
  const cards = currentCards(result);
  pullCount.textContent = String(cards.length);

  const byGroup = new Map();
  for (const card of cards) {
    const group = groupLabel(card);
    if (!byGroup.has(group)) byGroup.set(group, new Map());
    const key = card.model_id;
    const existing = byGroup.get(group).get(key) || { card, qty: 0 };
    existing.qty++;
    byGroup.get(group).set(key, existing);
  }

  let html = "";
  const groups = [...byGroup.keys()].sort((a, b) => {
    const ai = groupOrder.indexOf(a);
    const bi = groupOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  for (const group of groups) {
    const items = [...byGroup.get(group).values()].sort((a, b) =>
      (a.card.collector_number || "").localeCompare(b.card.collector_number || "", undefined, { numeric: true })
      || a.card.name.localeCompare(b.card.name)
    );

    html += `<div class="pull-group">
      <div class="pull-group-title">${escapeHtml(group)}</div>`;

    for (const item of items) {
      html += `<div class="pull-item">
        <span class="pull-qty">${item.qty}×</span>
        <span>${escapeHtml(item.card.name)}</span>
        <span class="pull-number">${escapeHtml(item.card.collector_number)}</span>
      </div>`;
    }

    html += `</div>`;
  }

  pullsEmpty.classList.toggle("hidden", cards.length > 0);
  pullList.classList.toggle("hidden", cards.length === 0);
  downloadArea.classList.toggle("hidden", cards.length === 0);
  pullList.innerHTML = html;
}

function renderPack(pack, packCodeValue) {
  const all = [...pack.cards, ...(pack.extras || [])];

  return `<div class="pack-detail">
    <div class="pack-detail-header">
      <strong>Pack ${pack.booster_index}</strong>
      ${packCodeValue ? `<div class="mini-code">${escapeHtml(packCodeValue)}</div>` : ""}
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

function renderBrick(brick, caseCodeValue, openedOnly = false) {
  const brickCodeValue = `${caseCodeValue}-B${brick.brick_index}`;
  const packs = brick.boosters.map((pack) => {
    const code = `${brickCodeValue}-P${String(pack.booster_index).padStart(2, "0")}`;
    return `<button class="pack-button" type="button" data-open-code="${escapeHtml(code)}">
      <strong>Pack ${pack.booster_index}</strong>
      <span>${pack.cards.length} figures · ${(pack.extras || []).length} insert</span>
    </button>`;
  }).join("");

  return `<div class="brick-card">
    <div class="brick-header">
      <div>
        <h3>Brick ${brick.brick_index}</h3>
        <div class="mini-code">${escapeHtml(brickCodeValue)}</div>
      </div>
      ${openedOnly ? "" : `<button type="button" class="secondary-btn compact" data-open-code="${escapeHtml(brickCodeValue)}">Open brick</button>`}
    </div>
    <div class="pack-grid">${packs}</div>
  </div>`;
}

function renderHierarchy(result) {
  if (result.kind === "pack") {
    hierarchy.innerHTML = renderPack(result.selected, result.code);
    return;
  }

  if (result.kind === "brick") {
    hierarchy.innerHTML = renderBrick(result.selected, result.case_code, true);
    return;
  }

  hierarchy.innerHTML = result.selected.bricks
    .map((brick) => renderBrick(brick, result.case_code, false))
    .join("");
}

function render(result) {
  state.result = result;
  emptyState.classList.add("hidden");
  resultView.classList.remove("hidden");

  resultKind.textContent = result.kind;
  resultTitle.textContent = `${result.set.name} ${result.kind[0].toUpperCase()}${result.kind.slice(1)}`;
  resultCode.textContent = result.code;
  codeInput.value = result.code;

  const url = new URL(window.location.href);
  url.searchParams.set("code", result.code);
  history.replaceState(null, "", url);

  renderHierarchy(result);
  renderPulls(result);
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
    showToast("This set does not have OCTGN export configured.");
    return;
  }

  const cards = currentCards(result);
  const grouped = new Map();
  for (const card of cards) {
    const existing = grouped.get(card.model_id) || { card, qty: 0 };
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

  const blob = new Blob([lines.join("\n") + "\n"], { type: "application/xml;charset=utf-8" });
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
  if (event.key === "Enter") openCode();
});

el("copyCodeBtn").addEventListener("click", async () => {
  if (!state.result) return;
  await navigator.clipboard.writeText(state.result.code);
  showToast("Code copied");
});

el("shareBtn").addEventListener("click", async () => {
  if (!state.result) return;
  await navigator.clipboard.writeText(shareUrlFor(state.result.code));
  showToast("Share link copied");
});

hierarchy.addEventListener("click", (event) => {
  const button = event.target.closest("[data-open-code]");
  if (button) openCode(button.dataset.openCode);
});

downloadO8dBtn.addEventListener("click", downloadO8d);

(async function init() {
  try {
    await loadSets();
    setKind("case");

    const code = new URL(window.location.href).searchParams.get("code");
    if (code) {
      codeInput.value = code;
      await openCode(code);
    }
  } catch (error) {
    showToast(error.message);
  }
})();
