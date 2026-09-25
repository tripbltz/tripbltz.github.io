import { pointsLabel } from "./services/scenarios.js";
import { createStore } from "./store.js";
import { getStats, getLegalTargets, canAttack } from "./engine.js";
import { renderMap, bindMap } from "./map.js";
import { createBattleUI, renderBattles } from "./battles.js";
import { renderSecondaryView, bindSecondaryView } from "./views.js";
import { openSettings, editTerritory, openSetup } from "./admin.js";
import {
  escapeHtml as e,
  icon,
  formatDate,
  playerName,
  factionName,
  safeColor,
  safeImage,
  modal,
  closeModal,
  toast,
} from "./ui.js";
const routes = [
  ["christopia", "globe", "Christopia"],
  ["battles", "swords", "Battles"],
  ["chronicle", "book", "Chronicle"],
  ["armies", "shield", "Armies"],
  ["campaign", "chart", "Campaign"],
  ["gallery", "image", "Gallery"],
];
const descriptions = {
  christopia: "One world. Two commanders. A history written in war.",
  battles: "Every engagement changes the fate of this world.",
  chronicle: "The victories, the sacrifices, and the stories that endure.",
  armies: "Muster your forces. Remember your heroes.",
  campaign: "The strategic picture. The path to planetary domination.",
  gallery: "Dispatches from the front line, preserved for posterity.",
};
let store,
  selectedId,
  attackMode = false,
  editMode = false,
  attackerId,
  battleFilter = {},
  busy = false;
const ctx = {
  get store() {
    return store;
  },
  render,
  run,
  openSettings: () => openSettings(ctx),
  editMap: () => {
    editMode = true;
    attackMode = false;
    location.hash = "christopia";
    render();
  },
  openTerritory: (id) => {
    selectedId = id;
    location.hash = "christopia";
    render();
    document
      .querySelector("#territory-dossier")
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  },
};
Object.assign(ctx, createBattleUI(ctx));
const route = () =>
  routes.some(([r]) => r === location.hash.slice(1))
    ? location.hash.slice(1)
    : "christopia";
async function run(command) {
  if (busy) {
    toast("The previous order is still being saved.", "error");
    return false;
  }
  busy = true;
  try {
    await store.commit(command);
    render();
    return true;
  } catch (err) {
    toast(
      err.message || "The order could not be saved. Please try again.",
      "error",
    );
    return false;
  } finally {
    busy = false;
  }
}
async function init() {
  try {
    store = await createStore();
    render();
  } catch (err) {
    document.querySelector("#app").innerHTML =
      `<div class="boot"><img src="assets/sigil.svg" width="64" alt=""><h1>VOX LINK INTERRUPTED</h1><p>${e(err.message)}</p><p class="muted">Your saved campaign has not been reset.</p><button class="btn" id="retry-boot">Retry connection</button></div>`;
    document.querySelector("#retry-boot").onclick = init;
  }
}
function render() {
  if (!store) return;
  if (store.mode === "cloud" && !store.user) {
    renderAuth();
    return;
  }
  if (!store.state?.campaign) {
    renderWelcome();
    return;
  }
  const s = store.state,
    stats = getStats(s),
    view = route();
  selectedId = s.territories.some((t) => t.id === selectedId)
    ? selectedId
    : s.territories.find((t) => t.contested)?.id || s.territories[0]?.id;
  attackerId = s.players.some((p) => p.id === attackerId)
    ? attackerId
    : store.actor?.player_id || s.players[0]?.id;
  const actor =
      s.players.find((p) => p.id === store.actor?.player_id) || s.players[0],
    isAdmin = store.actor?.role !== "player";
  document.title = `${routes.find((r) => r[0] === view)[2]} · The War for Christopia`;
  document.querySelector("#app").innerHTML =
    `<div class="app-shell"><aside class="sidebar" id="sidebar"><a class="brand" href="#christopia" aria-label="Christopia campaign home"><img src="assets/sigil.svg" alt=""><strong>CHRISTOPIA</strong><span>PLANETARY CAMPAIGN COMMAND</span></a><div class="nav-label">STRATEGIC COMMAND</div><nav class="nav" aria-label="Campaign navigation">${routes.map(([id, ic, label]) => `<a href="#${id}" class="${view === id ? "active" : ""}" ${view === id ? 'aria-current="page"' : ""} title="${label}">${icon(ic)}<span>${label.toUpperCase()}</span></a>`).join("")}</nav><div class="sidebar-foot"><div class="sector-seal">${icon("shield")}<p>BY OUR DEEDS<br>SHALL THIS WORLD BE CLAIMED.</p></div><div class="connection"><i class="signal"></i>${store.mode === "demo" ? "LOCAL CAMPAIGN DEMO" : "SECURE VOX LINK ACTIVE"}</div><div class="commander-button"><div class="avatar">${e((actor?.name || "C").slice(0, 2).toUpperCase())}</div><button id="commander-menu"><strong>${e(actor?.name || "Commander")}</strong><small>${isAdmin ? "CAMPAIGN ADMIN" : "FIELD COMMANDER"} ${icon("chevron")}</small></button></div></div></aside><div class="main-wrap"><header class="topbar"><div class="inline-actions"><button class="icon-btn mobile-menu" id="mobile-menu" aria-label="Toggle navigation">${icon("menu")}</button><div class="breadcrumb">SEGMENTUM OBSCURUS <span>/ CHRISTOPIA SYSTEM</span></div></div><div class="topbar-actions"><span class="date-stamp">+++ ${new Date().getFullYear() - 2000}.M42 +++</span><button class="icon-btn" id="refresh-data" title="Refresh campaign" aria-label="Refresh campaign">${icon("refresh")}</button>${isAdmin ? `<button class="icon-btn" id="settings" title="Campaign settings" aria-label="Campaign settings">${icon("settings")}</button>` : ""}</div></header><main class="main" id="main"><div class="page-head"><div><p class="eyebrow">${view === "christopia" ? "IMPERIAL CARTOGRAPHICA // PLANETARY OVERVIEW" : `CAMPAIGN ARCHIVE // ${view.toUpperCase()}`}</p><h1>${view === "christopia" ? "THE WAR FOR CHRISTOPIA" : routes.find((r) => r[0] === view)[2].toUpperCase()}</h1><p class="muted">${descriptions[view]}</p></div><div class="page-actions"><div class="turn-badge"><span>CAMPAIGN TURN</span><strong>${String(s.campaign.turn).padStart(2, "0")}</strong></div>${s.campaign.status === "active" ? `<button class="btn btn-primary" id="new-battle">${icon("plus")}New battle</button>` : `<span class="badge">${e(s.campaign.status)}</span>`}</div></div>${view === "christopia" ? renderHome(s, stats) : view === "battles" ? renderBattles(s, battleFilter) : `<div class="secondary-view">${renderSecondaryView(view, s, ctx)}</div>`}<footer class="page-footer"><span>CHRISTOPIA CAMPAIGN ARCHIVE · ${store.mode === "demo" ? "LOCAL DEMO / SAVED IN THIS BROWSER" : "PRIVATE / MEMBERS ONLY"}</span><span>THE EMPEROR PROTECTS. THE RECORD ENDURES.</span></footer></main></div></div>`;
  document.querySelector("#mobile-menu").onclick = () =>
    document.querySelector("#sidebar").classList.toggle("open");
  document
    .querySelector("#settings")
    ?.addEventListener("click", () => openSettings(ctx));
  document
    .querySelector("#new-battle")
    ?.addEventListener("click", () => ctx.openNewBattle());
  document
    .querySelector("#commander-menu")
    ?.addEventListener("click", commanderMenu);
  document.querySelector("#refresh-data").onclick = async () => {
    try {
      await store.refresh();
      render();
      toast("Tactical data refreshed.");
    } catch (err) {
      toast(err.message, "error");
    }
  };
  if (view === "christopia") bindHome(s);
  else if (view === "battles") bindBattles();
  else bindSecondaryView(view, s, ctx);
  document.querySelectorAll("img").forEach((img) =>
    img.addEventListener("error", () => {
      img.alt =
        "Photograph unavailable — refresh the campaign to renew its link.";
      img.classList.add("image-unavailable");
    }),
  );
}
function renderHome(s, stats) {
  const territory = s.territories.find((t) => t.id === selectedId),
    latest = [...s.battles]
      .filter((b) => b.status === "completed")
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0],
    activeEvent = s.events.find((ev) => ev.active);
  const leaders = stats.players.filter(
    (p) => p.domination >= s.settings.domination_threshold,
  );
  return `${s.campaign.status === "completed" ? `<div class="final-assault"><p class="eyebrow">THE FINAL TRANSMISSION</p><h2>CHRISTOPIA HAS FALLEN</h2><p>${e(playerName(s, s.campaign.winner_id))} has claimed the planet. <a href="#campaign">Open the campaign summary →</a></p></div>` : s.settings.final_assault_enabled && leaders.length ? `<div class="dispatch-bar">${icon("flag")}<span><span class="eyebrow">FINAL ASSAULT UNLOCKED</span>${leaders.map((p) => e(p.name)).join(", ")} may strike at the enemy headquarters.</span><a href="#campaign">View orders →</a></div>` : ""}${editMode ? '<div class="notice"><strong>MAP EDITOR ACTIVE</strong>Drag a marker to reposition it. Select a location to edit its name, coordinates and connections. Changes save immediately. <button class="btn btn-sm" id="finish-map-edit">Finish editing</button></div>' : ""}${
    attackMode
      ? `<div class="notice"><strong>SELECT AN ATTACK TARGET</strong>Highlighted locations are legal targets. <label class="inline-actions">Commander <select id="map-attacker">${s.players
          .filter(
            (p) =>
              store.actor?.role !== "player" || p.id === store.actor.player_id,
          )
          .map(
            (p) =>
              `<option value="${p.id}" ${p.id === attackerId ? "selected" : ""}>${e(p.name)}</option>`,
          )
          .join(
            "",
          )}</select><button class="btn btn-sm" id="cancel-attack">Cancel</button></label></div>`
      : ""
  }<div class="tactical-layout"><section class="panel tactical-panel" aria-label="Interactive planetary map"><div class="map-header"><div><h2>CHRISTOPIA <span class="muted">/ STRATEGIC ATLAS</span></h2><p class="eyebrow">CLASSIFICATION: CIVILISED WORLD · ${s.territories.length} STRATEGIC LOCATIONS</p></div><span class="live-indicator"><i class="signal"></i>TACTICAL FEED LIVE</span></div><div class="map-stage">${renderMap(s, selectedId, { attackMode, playerId: attackerId, editMode })}</div><div class="map-bottom"><div class="map-legend">${s.players.map((p) => `<span style="--owner:${safeColor(p.color)}"><i class="legend-dot"></i>${e(p.name)}</span>`).join("")}<span style="--owner:#c6ab68"><i class="legend-dot"></i>Contested</span><span style="--owner:#8b9289"><i class="legend-dot"></i>Neutral</span></div><div class="map-controls"><button class="icon-btn" id="map-location-list" title="List territories" aria-label="List all territories">${icon("menu")}</button><button class="icon-btn" id="map-attack-mode" title="Highlight legal attacks" aria-label="Highlight legal attack targets">${icon("target")}</button></div></div><div class="tactical-note"><span>SELECT A LOCATION TO ACCESS ITS DOSSIER</span><span>ORB SCAN: 031.442 / STABLE</span></div></section><aside class="side-stack"><section class="panel" id="territory-dossier">${territory ? renderDossier(s, territory) : '<div class="empty-state">No territories. Create one in settings.</div>'}</section>${latest ? `<section class="panel report-mini"><p class="eyebrow">LATEST ENGAGEMENT</p><h3>${e(latest.name)}</h3><p class="muted">${formatDate(latest.date)} · ${pointsLabel(latest)} pts</p><div class="report-score">${latest.attacker_score} <span class="muted">—</span> ${latest.defender_score}</div><p>${latest.result === "draw" ? "A hard-fought draw" : e(factionName(s, latest.result === "attacker" ? latest.attacker_faction_id : latest.defender_faction_id)) + " victorious"}</p><button class="btn btn-ghost btn-block btn-sm" data-battle="${latest.id}">Read field report ${icon("arrow")}</button></section>` : ""}</aside></div><div class="war-overview">${stats.players
    .slice(0, 2)
    .map(
      (p) =>
        `<section class="panel player-control" style="--owner:${safeColor(p.color)}"><div class="player-control-head"><div class="faction-emblem">${icon(p === stats.players[0] ? "shield" : "swords")}</div><div><h3>${e(p.name)}</h3><p class="eyebrow">${e(s.factions.find((f) => f.player_id === p.id)?.name || "UNASSIGNED")}</p></div></div><div class="control-numbers"><strong>${Math.round(p.domination)}<small>%</small></strong><span>PLANETARY CONTROL</span></div><div class="control-meter"><i style="width:${p.domination}%"></i></div><div class="player-control-foot"><span><b>${p.territories}</b> territories</span><span><b>${p.wins}</b> victories</span><span><b>${p.resources}</b> resources</span></div></section>`,
    )
    .join(
      "",
    )}<section class="panel war-status"><h3>CURRENT WAR STATUS</h3><div class="status-counts"><div><strong>${String(stats.total_battles).padStart(2, "0")}</strong><span>BATTLES FOUGHT</span></div><div><strong>${String(stats.contested).padStart(2, "0")}</strong><span>CONTESTED</span></div><div><strong>${String(stats.neutral).padStart(2, "0")}</strong><span>NEUTRAL</span></div></div><p class="eyebrow">DOMINATION AT ${s.settings.domination_threshold}% · FINAL ASSAULT ${s.settings.final_assault_enabled ? "ENABLED" : "DISABLED"}</p></section></div><div class="dispatch-bar">${icon("bolt")}<span><span class="eyebrow">${activeEvent ? "PLANETARY DISPATCH" : "COMMANDER’S BRIEFING"}</span>${activeEvent ? e(activeEvent.title) + " — " + e(activeEvent.description) : "Fortune favours the bold. Select a frontier territory to plan your next engagement."}</span><a href="#campaign">Campaign orders ${icon("arrow")}</a></div>`;
}
function renderDossier(s, t) {
  const owner = s.players.find((p) => p.id === t.owner_id),
    battles = s.battles.filter((b) => b.territory_id === t.id),
    active = battles.find((b) => b.status === "active"),
    bonus = {
      none: ["Strategic foothold", "A staging ground for the next advance."],
      resource: [
        "Industrial production",
        "Produces +1 campaign resource each turn.",
      ],
      spaceport: [
        "Orbital deployment",
        "The controller may attack any territory on Christopia.",
      ],
      defence: [
        "Fortified position",
        "A defensive narrative advantage. Agree any house rules together.",
      ],
      domination: [
        "Population centre",
        `${t.strategic_value} domination points. A vital symbol of planetary control.`,
      ],
    }[t.bonus_key] || ["Strategic asset", "Consult the campaign orders."];
  return `<div class="panel-head"><h2>TERRITORY DOSSIER</h2><span class="eyebrow">${String(s.territories.indexOf(t) + 1).padStart(2, "0")} / ${s.territories.length}</span></div><div class="dossier-visual">${t.image_url ? `<img src="${safeImage(t.image_url)}" alt="${e(t.name)}">` : ""}${icon(t.headquarters_for ? "flag" : t.bonus_key === "defence" ? "shield" : "target")}</div><div class="dossier-body"><p class="eyebrow">${e(t.type)} ${t.headquarters_for ? " / HEADQUARTERS" : ""}</p><h2 class="dossier-title">${e(t.name)}</h2><span class="badge ${t.contested ? "active" : t.owner_id ? "completed" : "neutral"}">${t.contested ? "⚔ CONTESTED" : t.owner_id ? "● " + e(owner?.name) + " CONTROL" : "○ NEUTRAL TERRITORY"}</span><dl class="detail-list"><div><dt>Controlled by</dt><dd style="color:${safeColor(owner?.color)}">${e(owner?.name || "Unclaimed")}</dd></div><div><dt>Scenario</dt><dd>${e(s.scenarios.find((sc) => sc.id === t.scenario_id)?.title || "Unassigned")}</dd></div><div><dt>Strategic value</dt><dd class="stars" aria-label="${t.strategic_value} stars">${"★".repeat(Math.min(5, t.strategic_value))}</dd></div><div><dt>Battles fought</dt><dd>${battles.filter((b) => b.status === "completed").length}</dd></div><div><dt>Times captured</dt><dd>${t.capture_count || 0}</dd></div>${active ? `<div><dt>Current attacker</dt><dd>${e(playerName(s, active.attacker_id))}</dd></div>` : ""}</dl><div class="dossier-bonus"><strong>${icon("shield")}${e(bonus[0])}</strong>${e(bonus[1])}</div><p class="dossier-description muted" style="font-size:11px;margin-bottom:17px">${e(t.description)}</p><div class="dossier-actions">${s.campaign.status === "active" ? `<button class="btn btn-primary" id="territory-attack">${icon(active ? "swords" : "target")}${active ? "View active battle" : "Attack territory"}</button>` : ""}<button class="btn btn-ghost" id="territory-history">${icon("book")}View territory history</button>${editMode ? '<button class="btn" id="edit-selected-territory">Edit territory</button>' : ""}</div></div>`;
}
function bindHome(s) {
  bindMap(
    s,
    (id) => {
      if (editMode) {
        selectedId = id;
        editTerritory(ctx, id);
      } else if (attackMode) {
        if (getLegalTargets(s, attackerId).includes(id)) {
          selectedId = id;
          ctx.openNewBattle(id, attackerId);
        } else toast(canAttack(s, attackerId, id).reason, "error");
      } else {
        selectedId = id;
        render();
      }
    },
    {
      editMode,
      onMove: async (id, x, y) => {
        const territory = {
            ...s.territories.find((t) => t.id === id),
            x: Math.round(x * 10) / 10,
            y: Math.round(y * 10) / 10,
          },
          neighbours = s.connections
            .filter((c) => c.territory_a === id || c.territory_b === id)
            .map((c) => (c.territory_a === id ? c.territory_b : c.territory_a));
        await run({
          type: "save_territory",
          payload: { territory, neighbours },
        });
      },
    },
  );
  document.querySelector("#territory-attack")?.addEventListener("click", () => {
    const b = s.battles.find(
      (b) => b.territory_id === selectedId && b.status === "active",
    );
    b ? ctx.openBattle(b.id) : ctx.openNewBattle(selectedId);
  });
  document
    .querySelector("#territory-history")
    ?.addEventListener("click", territoryHistory);
  document.querySelector("#map-attack-mode").onclick = () => {
    attackMode = !attackMode;
    editMode = false;
    render();
  };
  document.querySelector("#cancel-attack")?.addEventListener("click", () => {
    attackMode = false;
    render();
  });
  document.querySelector("#map-attacker")?.addEventListener("change", (ev) => {
    attackerId = ev.target.value;
    render();
  });
  document.querySelector("#finish-map-edit")?.addEventListener("click", () => {
    editMode = false;
    render();
  });
  document
    .querySelector("#edit-selected-territory")
    ?.addEventListener("click", () => editTerritory(ctx, selectedId));
  document.querySelector("#map-location-list").onclick = () => {
    modal(
      "Strategic locations",
      `<div class="editor-list">${s.territories.map((t) => `<button class="editor-item btn-ghost" data-pick-territory="${t.id}"><span>${e(t.name)}</span><span class="badge">${e(playerName(s, t.owner_id))}</span></button>`).join("")}</div>`,
    );
    document.querySelectorAll("[data-pick-territory]").forEach(
      (b) =>
        (b.onclick = () => {
          selectedId = b.dataset.pickTerritory;
          closeModal();
          render();
        }),
    );
  };
  document
    .querySelectorAll("[data-battle]")
    .forEach((b) => (b.onclick = () => ctx.openBattle(b.dataset.battle)));
}
function territoryHistory() {
  const s = store.state,
    t = s.territories.find((t) => t.id === selectedId),
    history = s.history.filter((h) => h.territory_id === t.id),
    battles = s.battles.filter((b) => b.territory_id === t.id);
  modal(
    t.name + " · history",
    `<p class="muted">${e(t.description)}</p><div class="section-heading"><h3>Territory record</h3><span class="badge">${t.capture_count || 0} captures</span></div>${history.length ? history.map((h) => `<div class="field-group"><p class="eyebrow">${formatDate(h.date)}</p><h3>${e(h.title)}</h3><p class="help-text">${e(h.description)}</p></div>`).join("") : '<p class="muted">No changes of control recorded.</p>'}<div class="section-heading"><h3>Engagements</h3></div><div class="editor-list">${battles.map((b) => `<button class="editor-item btn-ghost" data-history-battle="${b.id}"><span>${e(b.name)}</span><span class="badge ${b.status}">${b.status}</span></button>`).join("") || '<p class="muted">No engagements recorded.</p>'}</div>`,
  );
  document
    .querySelectorAll("[data-history-battle]")
    .forEach(
      (b) => (b.onclick = () => ctx.openBattle(b.dataset.historyBattle)),
    );
}
function bindBattles() {
  document
    .querySelectorAll("[data-battle]")
    .forEach((b) => (b.onclick = () => ctx.openBattle(b.dataset.battle)));
  document.querySelector("#battle-search").oninput = (ev) => {
    battleFilter.search = ev.target.value;
    const cursor = ev.target.selectionStart;
    render();
    const input = document.querySelector("#battle-search");
    input.focus();
    input.setSelectionRange(cursor, cursor);
  };
  document.querySelector("#battle-player").onchange = (ev) => {
    battleFilter.player = ev.target.value;
    render();
  };
  document.querySelector("#battle-status").onchange = (ev) => {
    battleFilter.status = ev.target.value;
    render();
  };
}
function commanderMenu() {
  modal(
    "Commander access",
    `<p class="muted">${store.mode === "demo" ? "You are exploring a campaign saved privately in this browser. Use campaign settings to create a fresh campaign." : "You are signed in as " + e(store.user?.email) + "."}</p><div class="form-actions"><button class="btn" id="open-setup">New campaign</button>${store.mode === "cloud" ? '<button class="btn btn-ghost" id="sign-out">Sign out</button>' : '<button class="btn" id="demo-settings">Campaign settings</button>'}</div>`,
  );
  document.querySelector("#open-setup").onclick = () => openSetup(ctx);
  document
    .querySelector("#demo-settings")
    ?.addEventListener("click", () => openSettings(ctx));
  document.querySelector("#sign-out")?.addEventListener("click", async () => {
    try {
      await store.signOut();
      closeModal();
      render();
    } catch (err) {
      toast(err.message, "error");
    }
  });
}
function renderAuth(signUp = false) {
  document.querySelector("#app").innerHTML =
    `<div class="auth-wrap"><div class="auth-art"><p class="eyebrow">A WARHAMMER 40,000 NARRATIVE CAMPAIGN</p><h1>ONE WORLD.<br>AN ENDLESS WAR.</h1><p class="muted">Chart the frontline. Record your victories.<br>Write the history of Christopia.</p></div><main class="auth-panel"><img src="assets/sigil.svg" alt=""><p class="eyebrow">CHRISTOPIA CAMPAIGN COMMAND</p><h2>${signUp ? "JOIN THE CAMPAIGN." : "WELCOME, COMMANDER."}</h2><p class="muted">${signUp ? "Create your private commander account." : "Identify yourself to access the strategic atlas."}</p><form id="auth-form">${`<label class="field"><span>Email address</span><input name="email" type="email" autocomplete="email" required></label><label class="field"><span>Password</span><input name="password" type="password" autocomplete="${signUp ? "new-password" : "current-password"}" minlength="8" required></label>`}<p id="auth-error" class="help-text" role="alert"></p><button class="btn btn-primary">${signUp ? "Create account" : "Access campaign command"}</button></form><button class="btn btn-ghost" id="auth-toggle" style="margin-top:15px">${signUp ? "Already enlisted? Sign in" : "New commander? Create account"}</button></main></div>`;
  document.querySelector("#auth-toggle").onclick = () => renderAuth(!signUp);
  document.querySelector("#auth-form").onsubmit = async (ev) => {
    ev.preventDefault();
    const d = new FormData(ev.target),
      btn = ev.target.querySelector("button");
    btn.disabled = true;
    try {
      if (signUp) {
        await store.signUp(d.get("email"), d.get("password"));
        toast("Account created. Check your email if confirmation is required.");
        if (store.user) render();
        else renderAuth();
      } else {
        await store.signIn(d.get("email"), d.get("password"));
        render();
      }
    } catch (err) {
      document.querySelector("#auth-error").textContent = err.message;
      btn.disabled = false;
    }
  };
}
function renderWelcome() {
  document.querySelector("#app").innerHTML =
    `<div class="boot"><img src="assets/sigil.svg" alt="" width="65"><p class="eyebrow">NO ACTIVE CAMPAIGN DETECTED</p><h1>WELCOME, COMMANDER.</h1><p class="muted">A world awaits its history.</p><button class="btn btn-primary" id="create-campaign">Create the War for Christopia</button>${store.mode === "cloud" ? '<p class="help-text">Joining a friend? Ask the campaign admin to connect your registered email.</p><button class="btn btn-ghost" id="check-invitation">Check for campaign access</button><button class="btn btn-ghost" id="welcome-sign-out">Sign out</button>' : ""}</div>`;
  document.querySelector("#create-campaign").onclick = () => openSetup(ctx);
  document
    .querySelector("#check-invitation")
    ?.addEventListener("click", async () => {
      try {
        await store.refresh();
        render();
      } catch (err) {
        toast(err.message, "error");
      }
    });
  document
    .querySelector("#welcome-sign-out")
    ?.addEventListener("click", async () => {
      await store.signOut();
      render();
    });
}
window.addEventListener("hashchange", () => {
  render();
  window.scrollTo(0, 0);
});
window.addEventListener("offline", () =>
  toast(
    "Vox link offline. Local demo remains available; cloud orders require a connection.",
    "error",
  ),
);
init();
