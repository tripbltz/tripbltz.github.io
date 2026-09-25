import { getStats } from "./engine.js";
import {
  escapeHtml as esc,
  icon,
  formatDate,
  playerName,
  factionName,
  field,
  modal,
  closeModal,
  toast,
} from "./ui.js";

const viewState = new Map();
const stateFor = (state) => {
  if (!viewState.has(state.campaign.id))
    viewState.set(state.campaign.id, { chronicle: "timeline", gallery: {} });
  return viewState.get(state.campaign.id);
};
const isAdmin = (ctx) => !ctx.store.actor || ctx.store.actor.role === "admin";
const isEditable = (state) => state.campaign.status !== "archived";
const canEditPlayer = (ctx, id) =>
  isAdmin(ctx) || ctx.store.actor?.player_id === id;
const activeCampaign = (state) => state.campaign.status === "active";
const safeColor = (value) =>
  /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#b5a16e";
const photoUrl = (value) =>
  /^(https?:|blob:|data:image\/(png|jpeg|webp|gif);)/i.test(value || "")
    ? esc(value)
    : "";
const options = (items, selected, empty = "All") =>
  `<option value="">${esc(empty)}</option>${items.map((item) => `<option value="${esc(item.id)}" ${item.id === selected ? "selected" : ""}>${esc(item.name || item.title)}</option>`).join("")}`;
const input = (name, value = "", extras = "") =>
  `<input name="${name}" value="${esc(value)}" ${extras}>`;
const textarea = (name, value = "", extras = "") =>
  `<textarea name="${name}" rows="4" ${extras}>${esc(value)}</textarea>`;
const empty = (title, text) =>
  `<div class="empty-state"><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
const button = (label, attr = "", type = "btn-ghost") =>
  `<button type="button" class="btn ${type}" ${attr}>${label}</button>`;
const percent = (value) =>
  Number(value || 0).toLocaleString("en-GB", { maximumFractionDigits: 1 });
const stat = (value, label) =>
  `<div class="stat"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;
const battleLink = (id, name, extra = "") =>
  `<button type="button" class="text-link" data-secondary-battle="${esc(id)}" ${extra}>${esc(name)}</button>`;
const roleNote = (ctx) =>
  isAdmin(ctx)
    ? ""
    : '<p class="muted">Campaign rules, turns and events are managed by your campaign administrator.</p>';

export function renderSecondaryView(view, state, ctx) {
  const renderers = {
    chronicle: renderChronicle,
    armies: renderArmies,
    campaign: renderCampaign,
    gallery: renderGallery,
  };
  const renderer = renderers[view];
  return renderer
    ? `<div class="secondary-view secondary-view--${view}">${renderer(state, ctx)}</div>`
    : "";
}

function renderChronicle(state, ctx) {
  const tab = stateFor(state).chronicle;
  const entries = [
    ...(tab === "timeline" ? state.chronicle : state.history),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));
  return `<div class="section-heading"><div><p class="eyebrow">The living record / ${state.battles.filter((b) => b.status === "completed").length} engagements</p><h2>The Chronicles of Christopia</h2><p class="muted">Every victory leaves a mark. Every defeat becomes a debt.</p></div></div>
    <div class="toolbar chronicle-tabs" role="tablist" aria-label="Chronicle view">${["timeline", "history"].map((key) => `<button type="button" class="btn ${tab === key ? "btn-primary" : "btn-ghost"}" role="tab" aria-selected="${tab === key}" data-chronicle-tab="${key}">${key === "timeline" ? "Battle timeline" : "Campaign history"}</button>`).join("")}</div>
    <div class="timeline" role="tabpanel">${
      entries.length
        ? entries
            .map((entry) => {
              const battle = state.battles.find(
                (b) => b.id === entry.battle_id,
              );
              const photos = state.photos
                .filter((p) => p.battle_id === entry.battle_id)
                .slice(0, 3);
              const territory = state.territories.find(
                (t) => t.id === entry.territory_id,
              );
              return `<article class="panel chronicle-entry"><div class="chronicle-date"><span class="eyebrow">${esc(formatDate(entry.date))}</span>${battle ? `<span class="badge">Turn ${esc(battle.turn)}</span>` : ""}</div><div class="chronicle-body"><h3>${esc(entry.title || battle?.name || "Campaign dispatch")}</h3>${battle && tab === "timeline" ? `<p class="muted">${esc(factionName(state, battle.attacker_faction_id))} <span aria-label="versus">vs</span> ${esc(factionName(state, battle.defender_faction_id))} <strong class="summary-score">${esc(battle.attacker_score ?? "–")} — ${esc(battle.defender_score ?? "–")}</strong></p>` : ""}<p class="narrative">${esc(tab === "timeline" ? entry.narrative : entry.description)}</p>${tab === "history" && territory ? `<p class="muted">${esc(territory.name)} · ${esc(playerName(state, entry.from_owner_id))} → ${esc(playerName(state, entry.to_owner_id))}</p>` : ""}${photos.length && tab === "timeline" ? `<div class="chronicle-photos">${photos.map((photo) => `<button type="button" class="photo-thumb" data-secondary-photo="${esc(photo.id)}" aria-label="Open ${esc(photo.caption || "battle photograph")}"><img loading="lazy" src="${photoUrl(photo.url)}" alt="${esc(photo.caption || battle?.name || "Battle photograph")}"></button>`).join("")}</div>` : ""}<div class="toolbar">${battle ? battleLink(battle.id, "Read battle report →") : ""}${tab === "timeline" && isEditable(state) ? button("Edit narrative", `data-edit-chronicle="${esc(entry.id)}"`) : ""}</div></div></article>`;
            })
            .join("")
        : empty(
            "No dispatches received",
            tab === "timeline"
              ? "Complete your first battle to begin the Chronicles of Christopia."
              : "Territory changes and major campaign events will be recorded here.",
          )
    }</div>`;
}

function renderArmies(state, ctx) {
  const stats = getStats(state);
  return `<div class="section-heading"><div><p class="eyebrow">Muster rolls / ${state.factions.length} factions</p><h2>Armies of Christopia</h2><p class="muted">The factions fighting for this world.</p></div>${isAdmin(ctx) && isEditable(state) ? button("+ Add faction", "data-new-faction", "btn-primary") : ""}</div>
  <div class="card-grid">${
    state.factions.length
      ? state.factions
          .map((faction) => {
            const battles = state.battles.filter(
              (b) =>
                b.status === "completed" &&
                [b.attacker_faction_id, b.defender_faction_id].includes(
                  faction.id,
                ),
            );
            const wins = battles.filter(
              (b) =>
                b.result ===
                (b.attacker_faction_id === faction.id
                  ? "attacker"
                  : "defender"),
            ).length;
            const losses = battles.filter(
              (b) =>
                b.result !== "draw" &&
                b.result !==
                  (b.attacker_faction_id === faction.id
                    ? "attacker"
                    : "defender"),
            ).length;
            const player = stats.players.find(
              (p) => p.id === faction.player_id,
            );
            return `<article class="card army-card" style="--faction-color:${safeColor(faction.color || player?.color)}"><div class="panel-head"><div class="army-mark" aria-hidden="true">${faction.image_url ? `<img src="${photoUrl(faction.image_url)}" alt="">` : icon("shield")}</div><span class="badge">${esc(playerName(state, faction.player_id))}</span></div><h3>${esc(faction.name)}</h3><p class="muted">${esc(faction.description || "A new force has entered the war for Christopia.")}</p><div class="stat-grid army-stats">${stat(battles.length, "Battles")}${stat(wins, "Victories")}${stat(losses, "Defeats")}</div><dl class="detail-list"><div><dt>Player territories</dt><dd>${esc(player?.territories || 0)}</dd></div><div><dt>Domination points</dt><dd>${esc(player?.domination_points || 0)}</dd></div></dl>${canEditPlayer(ctx, faction.player_id) && isEditable(state) ? button("Edit faction", `data-edit-faction="${esc(faction.id)}"`) : ""}</article>`;
          })
          .join("")
      : empty(
          "No forces mustered",
          "Add the factions taking part in this campaign.",
        )
  }</div>
`;
}

function renderCampaign(state, ctx) {
  const stats = getStats(state);
  const completed = state.battles.filter((b) => b.status === "completed");
  const threshold = Number(state.settings.domination_threshold || 70);
  const leaders = stats.players.filter((p) => p.domination >= threshold);
  const end = state.campaign.ended_at || new Date().toISOString();
  const duration = Math.max(
    1,
    Math.ceil(
      (new Date(end) - new Date(state.campaign.started_at || end)) / 86400000,
    ),
  );
  const winner = stats.players.find((p) => p.id === state.campaign.winner_id);
  const admin = isAdmin(ctx);
  const active = activeCampaign(state);
  return `<div class="section-heading"><div><p class="eyebrow">Strategic command / Turn ${esc(state.campaign.turn)}</p><h2>${esc(state.campaign.name)}</h2><p class="muted">${esc(formatDate(state.campaign.started_at))} — ${duration} days of war · ${esc(state.campaign.status)}</p></div><div class="toolbar">${admin && isEditable(state) ? button("Campaign settings", "data-campaign-settings") : ""}${admin && active ? button("Advance turn", "data-advance-turn", "btn-primary") : ""}</div></div>
  ${
    winner
      ? `<section class="panel final-assault"><p class="eyebrow">The final transmission</p><h2>Christopia has fallen</h2><p><strong>${esc(winner.name)}</strong> has claimed this world.</p><p class="muted">${esc(
          state.factions
            .filter((f) => f.player_id === winner.id)
            .map((f) => f.name)
            .join(" · "),
        )}</p><div class="stat-grid">${stat(`${percent(winner.domination)}%`, "Final control")}${stat(winner.wins, "Battles won")}${stat(duration, "Days of war")}${stat(completed.length, "Engagements")}</div><p class="muted">The map, battle reports, photographs and chronicles preserve the complete story of this campaign.</p></section>`
      : ""
  }
  ${
    active && leaders.length && state.settings.final_assault_enabled
      ? `<section class="panel final-assault"><p class="eyebrow">Planetary domination threshold reached</p><h3>The Final Assault is unlocked</h3>${leaders
          .map((leader) => {
            const hq = state.territories.find(
              (t) => t.headquarters_for && t.headquarters_for !== leader.id,
            );
            return `<p><strong>${esc(leader.name)}</strong> controls ${esc(percent(leader.domination))}% of Christopia. Victory at an enemy Planetary Headquarters will end the campaign.</p>${hq && canEditPlayer(ctx, leader.id) ? button(`Prepare assault on ${esc(hq.name)}`, `data-final-assault="${esc(hq.id)}"`, "btn-primary") : ""}`;
          })
          .join(
            "",
          )}<p class="muted">A failed Final Assault costs the attacker ${esc(state.settings.final_assault_penalty ?? 3)} territories.</p></section>`
      : ""
  }
  <div class="player-comparison card-grid">${stats.players
    .map(
      (player) =>
        `<section class="panel player-summary" style="--faction-color:${safeColor(player.color)}"><p class="eyebrow">${esc(
          state.factions
            .filter((f) => f.player_id === player.id)
            .map((f) => f.name)
            .join(" / ") || "No faction assigned",
        )}</p><h3>${esc(player.name)}</h3><div class="stat-grid">${stat(player.territories, "Territories")}${stat(player.wins, "Victories")}${stat(`${percent(player.domination)}%`, "Domination")}</div><div class="progress" role="progressbar" aria-label="${esc(player.name)} domination" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${esc(player.domination)}"><span style="width:${Math.min(100, Math.max(0, player.domination))}%;background:${safeColor(player.color)}"></span></div><p class="muted">${esc(player.domination_points)} domination points · ${esc(player.streak || 0)} consecutive wins${state.settings.resources_enabled ? ` · ${esc(player.resources || 0)} resources` : ""}</p></section>`,
    )
    .join("")}</div>
  <section class="panel"><div class="panel-head"><h3>Planetary control</h3><span class="badge">${esc(threshold)}% unlocks Final Assault</span></div><div class="control-bar" role="img" aria-label="${esc(stats.players.map((p) => `${p.name}: ${percent(p.domination)}%`).join("; "))}">${stats.players.map((p) => `<span class="control-segment" style="width:${Math.max(0, Number(p.domination))}%;background:${safeColor(p.color)}" title="${esc(p.name)}: ${esc(percent(p.domination))}%"></span>`).join("")}</div><div class="toolbar">${stats.players.map((p) => `<span class="badge"><i class="owner-dot" style="background:${safeColor(p.color)}"></i>${esc(p.name)} ${esc(percent(p.domination))}%</span>`).join("")}<span class="badge">${stats.neutral} neutral locations</span></div><div class="stat-grid">${stat(stats.total_battles, "Battles recorded")}${stat(state.campaign.turn, "Campaign turn")}${stat(state.territories.length, "Locations")}${stat(stats.contested, "Contested")}${stat(stats.neutral, "Neutral")}</div></section>
  <div class="record-grid card-grid">${record("Largest victory", stats.largest_victory, stats.largest_victory ? `${stats.largest_victory.margin} point margin` : "", "battle")}${record("Closest battle", stats.closest_battle, stats.closest_battle ? `${stats.closest_battle.margin} point difference` : "", "battle")}${record("Most contested location", stats.most_contested, stats.most_contested ? `${stats.most_contested.battles} engagements · ${stats.most_contested.capture_count || 0} captures` : "", "territory")}${record("Most successful faction", stats.most_successful_faction, stats.most_successful_faction ? `${stats.most_successful_faction.wins} victories` : "")}</div>
  ${state.settings.resources_enabled ? renderResources(state, ctx) : ""}
  ${state.settings.random_events_enabled ? renderEvents(state, ctx) : ""}
  <section class="panel"><div class="panel-head"><div><p class="eyebrow">The long war</p><h3>Campaign record</h3></div>${button("View campaigns", "data-view-campaigns")}${admin && isEditable(state) ? button("Archive campaign", "data-archive-campaign") : ""}</div><p class="muted">${esc(state.settings.attacks_per_turn)} attack${Number(state.settings.attacks_per_turn) === 1 ? "" : "s"} per player each turn. ${state.campaign.status === "archived" ? "This campaign is archived. Its complete history remains available to read." : "Archiving preserves the map, battles, photographs and history, and closes this campaign to further changes."}</p>${roleNote(ctx)}</section>`;
}

function record(label, item, sub, kind) {
  return `<article class="card record-card"><p class="eyebrow">${esc(label)}</p><h4>${item ? (kind === "battle" ? battleLink(item.id, item.name) : kind === "territory" ? `<button type="button" class="text-link" data-secondary-territory="${esc(item.id)}">${esc(item.name)}</button>` : esc(item.name)) : "Awaiting records"}</h4><p class="muted">${esc(sub || "The war will decide.")}</p></article>`;
}

function renderResources(state, ctx) {
  const transactions = [...state.transactions]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 6);
  return `<section class="panel"><div class="panel-head"><div><p class="eyebrow">Prepare for the next battle</p><h3>Campaign resources</h3></div><div class="toolbar">${state.players.map((p) => `<span class="badge">${esc(p.name)} · ${esc(p.resources || 0)} resources</span>`).join("")}</div></div><p class="muted">Earn resources from battle results and production territories each turn. These will buy boosts for your tabletop games. The benefits and costs are still <strong>to decide</strong>; keep earning resources until those rules are agreed.</p><div class="resource-actions card-grid">${state.actions.map((action) => `<article class="card"><h4>${esc(action.name)}</h4><p>Benefit in your game: <strong>to decide</strong></p><p>Resource cost: <strong>to decide</strong></p><button class="btn btn-ghost" disabled>To decide</button></article>`).join("")}</div><p class="help-text">No resources are spent and no game effects are applied while a boost is awaiting its rules.</p>${transactions.length ? `<details><summary>Recent resource transactions</summary><div class="table-wrap"><table><thead><tr><th>Commander</th><th>Change</th><th>Reason</th><th>Date</th></tr></thead><tbody>${transactions.map((t) => `<tr><td>${esc(playerName(state, t.player_id))}</td><td>${Number(t.amount) > 0 ? "+" : ""}${esc(t.amount)}</td><td>${esc(t.reason)}</td><td>${esc(formatDate(t.date))}</td></tr>`).join("")}</tbody></table></div></details>` : ""}</section>`;
}

function renderEvents(state, ctx) {
  const active = state.events.filter((e) => e.active);
  return `<section class="panel"><div class="panel-head"><div><p class="eyebrow">Conditions on the ground</p><h3>Planetary events</h3></div>${isAdmin(ctx) && activeCampaign(state) ? `<div class="toolbar">${button("Random event", "data-random-event")}${button("Select event", "data-select-event")}${button("+ Add event", "data-new-event")}</div>` : ""}</div><p class="muted">${state.settings.gameplay_modifiers_enabled ? "Gameplay effects are optional house rules. Agree any tabletop changes with your opponent." : "Narrative only. Tabletop gameplay modifiers are disabled."}</p><div class="event-list">${active.length ? active.map((event) => `<article class="card event-card"><div class="panel-head"><h4>${esc(event.title)}</h4><span class="badge">${esc(event.remaining_turns ?? event.duration)} turn${Number(event.remaining_turns ?? event.duration) === 1 ? "" : "s"} remaining</span></div><p>${esc(event.description)}</p>${event.effect && state.settings.gameplay_modifiers_enabled ? `<p class="muted"><strong>Optional house rule:</strong> ${esc(event.effect)}</p>` : ""}${isAdmin(ctx) && isEditable(state) ? button("Edit event", `data-edit-event="${esc(event.id)}"`) : ""}</article>`).join("") : empty("No active planetary events", "Christopia is quiet. For now.")}</div></section>`;
}

function renderGallery(state) {
  const filters = stateFor(state).gallery;
  const photos = state.photos
    .filter((photo) => {
      const battle = state.battles.find((b) => b.id === photo.battle_id);
      if (!battle) return false;
      return (
        (!filters.battle || battle.id === filters.battle) &&
        (!filters.territory || battle.territory_id === filters.territory) &&
        (!filters.player ||
          [battle.attacker_id, battle.defender_id].includes(filters.player)) &&
        (!filters.faction ||
          [battle.attacker_faction_id, battle.defender_faction_id].includes(
            filters.faction,
          )) &&
        (!filters.from || String(battle.date).slice(0, 10) >= filters.from) &&
        (!filters.to || String(battle.date).slice(0, 10) <= filters.to)
      );
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const filtered = Object.values(filters).some(Boolean);
  return `<div class="section-heading"><div><p class="eyebrow">Pict-captures / ${state.photos.length} photographs</p><h2>From the front lines</h2><p class="muted">The armies, the battlefields and the moments worth remembering.</p></div></div><form id="gallery-filters" class="panel form-grid gallery-filters">${field("Battle", `<select name="battle">${options(state.battles, filters.battle, "Every battle")}</select>`)}${field("Territory", `<select name="territory">${options(state.territories, filters.territory, "Every territory")}</select>`)}${field("Player", `<select name="player">${options(state.players, filters.player, "Every player")}</select>`)}${field("Faction", `<select name="faction">${options(state.factions, filters.faction, "Every faction")}</select>`)}${field("From battle date", input("from", filters.from, 'type="date"'))}${field("To battle date", input("to", filters.to, 'type="date"'))}<div class="toolbar"><span class="muted">${photos.length} photograph${photos.length === 1 ? "" : "s"}</span>${filtered ? button("Clear filters", "data-clear-gallery") : ""}</div></form><div class="gallery-grid">${
    photos.length
      ? photos
          .map((photo) => {
            const battle = state.battles.find((b) => b.id === photo.battle_id);
            const territory = state.territories.find(
              (t) => t.id === battle.territory_id,
            );
            return `<figure class="card gallery-photo"><button type="button" data-secondary-photo="${esc(photo.id)}" aria-label="Open ${esc(photo.caption || battle.name)}"><img loading="lazy" src="${photoUrl(photo.url)}" alt="${esc(photo.caption || `Photograph from ${battle.name}`)}"></button><figcaption>${photo.caption ? `<p>${esc(photo.caption)}</p>` : ""}${battleLink(battle.id, battle.name)}<p class="muted">${esc(territory?.name || "Unknown territory")} · ${esc(formatDate(battle.date))}</p></figcaption></figure>`;
          })
          .join("")
      : empty(
          filtered ? "No pict-captures match" : "The pict-vault is empty",
          filtered
            ? "Try clearing a filter to reveal more photographs."
            : "Upload photographs from a battle report to add them to the campaign gallery.",
        )
  }</div>`;
}

export function bindSecondaryView(view, state, ctx) {
  document
    .querySelectorAll("[data-secondary-battle]")
    .forEach((el) =>
      el.addEventListener("click", () =>
        ctx.openBattle(el.dataset.secondaryBattle),
      ),
    );
  document
    .querySelectorAll("[data-secondary-territory]")
    .forEach((el) =>
      el.addEventListener("click", () =>
        ctx.openTerritory(el.dataset.secondaryTerritory),
      ),
    );
  document
    .querySelectorAll("[data-secondary-photo]")
    .forEach((el) =>
      el.addEventListener("click", () =>
        ctx.openPhoto(el.dataset.secondaryPhoto),
      ),
    );
  document.querySelectorAll("[data-chronicle-tab]").forEach((el) =>
    el.addEventListener("click", () => {
      stateFor(state).chronicle = el.dataset.chronicleTab;
      ctx.render();
    }),
  );
  document
    .querySelectorAll("[data-edit-chronicle]")
    .forEach((el) =>
      el.addEventListener("click", () =>
        editChronicle(state, ctx, el.dataset.editChronicle),
      ),
    );
  document
    .querySelector("[data-new-faction]")
    ?.addEventListener("click", () => editFaction(state, ctx));
  document
    .querySelectorAll("[data-edit-faction]")
    .forEach((el) =>
      el.addEventListener("click", () =>
        editFaction(state, ctx, el.dataset.editFaction),
      ),
    );
  document
    .querySelector("[data-campaign-settings]")
    ?.addEventListener("click", () => ctx.openSettings());
  document
    .querySelector("[data-advance-turn]")
    ?.addEventListener("click", () => advanceTurn(state, ctx));
  document
    .querySelector("[data-archive-campaign]")
    ?.addEventListener("click", () => archiveCampaign(state, ctx));
  document
    .querySelector("[data-view-campaigns]")
    ?.addEventListener("click", () => showCampaigns(ctx));
  document
    .querySelectorAll("[data-final-assault]")
    .forEach((el) =>
      el.addEventListener("click", () =>
        ctx.openNewBattle(el.dataset.finalAssault),
      ),
    );
  document
    .querySelector("[data-new-event]")
    ?.addEventListener("click", () => editEvent(state, ctx));
  document
    .querySelectorAll("[data-edit-event]")
    .forEach((el) =>
      el.addEventListener("click", () =>
        editEvent(state, ctx, el.dataset.editEvent),
      ),
    );
  document
    .querySelector("[data-random-event]")
    ?.addEventListener("click", () => selectEvent(state, ctx, true));
  document
    .querySelector("[data-select-event]")
    ?.addEventListener("click", () => selectEvent(state, ctx));
  const gallery = document.getElementById("gallery-filters");
  gallery?.addEventListener("submit", (event) => event.preventDefault());
  gallery?.addEventListener("change", () => {
    stateFor(state).gallery = Object.fromEntries(new FormData(gallery));
    ctx.render();
  });
  document
    .querySelector("[data-clear-gallery]")
    ?.addEventListener("click", () => {
      stateFor(state).gallery = {};
      ctx.render();
    });
}

function formModal(title, content, label = "Save changes") {
  modal(
    title,
    `<form id="secondary-form">${content}<p class="form-error" id="secondary-error" role="alert" hidden></p><div class="toolbar form-actions"><button class="btn btn-primary" type="submit">${esc(label)}</button>${button("Cancel", "data-secondary-cancel")}</div></form>`,
  );
  document
    .querySelector("[data-secondary-cancel]")
    ?.addEventListener("click", closeModal);
  return document.getElementById("secondary-form");
}

function onSave(form, callback) {
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const submit = form.querySelector('[type="submit"]');
    const error = form.querySelector("#secondary-error");
    submit.disabled = true;
    try {
      const success = await callback(Object.fromEntries(new FormData(form)));
      if (success !== false) closeModal();
    } catch (err) {
      error.hidden = false;
      error.textContent =
        err.message || "Unable to save this change. Please try again.";
    } finally {
      submit.disabled = false;
    }
  });
}

function editChronicle(state, ctx, id) {
  const entry = state.chronicle.find((e) => e.id === id);
  if (!entry) return;
  const form = formModal(
    "Amend the chronicle",
    `<p class="muted">${esc(entry.title)}</p>${field("Narrative", textarea("narrative", entry.narrative, 'required maxlength="12000"'))}`,
  );
  onSave(form, (values) =>
    ctx.run({
      type: "save_chronicle",
      payload: { id, narrative: values.narrative.trim() },
    }),
  );
}

function editFaction(state, ctx, id) {
  const faction = state.factions.find((f) => f.id === id) || {
    id: crypto.randomUUID(),
    player_id: ctx.store.actor?.player_id || state.players[0]?.id,
    color: "#b5a16e",
  };
  const players = state.players.filter((p) => canEditPlayer(ctx, p.id));
  const form = formModal(
    id ? "Edit faction" : "Muster a faction",
    `<div class="form-grid">${field("Faction name", input("name", faction.name, 'required maxlength="100"'))}${field("Commander", `<select name="player_id" required>${options(players, faction.player_id, "Choose a commander")}</select>`)}${field("Campaign colour", input("color", safeColor(faction.color), 'type="color"'))}${field("Image URL (optional)", input("image_url", faction.image_url, 'type="url" placeholder="https://…"'))}</div>${field("Faction background", textarea("description", faction.description, 'maxlength="4000"'))}`,
  );
  onSave(form, (values) =>
    ctx.run({
      type: "save_faction",
      payload: { faction: { ...faction, ...values, name: values.name.trim() } },
    }),
  );
}

function advanceTurn(state, ctx) {
  const unresolved = state.battles.filter((b) =>
    ["planned", "active"].includes(b.status),
  );
  if (unresolved.length) {
    modal(
      "Engagements still unresolved",
      `<p>Complete every planned and active battle before advancing the campaign turn.</p><div class="event-list">${unresolved.map((b) => `<article class="card"><h4>${esc(b.name)}</h4><p class="muted">${esc(b.status)} · Turn ${esc(b.turn)}</p>${button("Open battle report", `data-unresolved-battle="${esc(b.id)}"`)}</article>`).join("")}</div>`,
    );
    document
      .querySelectorAll("[data-unresolved-battle]")
      .forEach((el) =>
        el.addEventListener("click", () =>
          ctx.openBattle(el.dataset.unresolvedBattle),
        ),
      );
    return;
  }
  const form = formModal(
    `Advance to turn ${Number(state.campaign.turn) + 1}`,
    `<p>Each commander receives a fresh allocation of ${esc(state.settings.attacks_per_turn)} campaign attacks.</p>${state.settings.resources_enabled ? `<ul>${state.players.map((p) => `<li>${esc(p.name)} gains ${state.territories.filter((t) => t.owner_id === p.id && t.bonus_key === "resource").length} resources from strategic locations.</li>`).join("")}</ul>` : ""}<p class="muted">Active events lose one turn of duration.${state.settings.random_events_enabled ? " A random planetary event will begin if an inactive event is available." : ""}</p>`,
    "Advance campaign turn",
  );
  onSave(form, () => ctx.run({ type: "advance_turn", payload: {} }));
}

function archiveCampaign(state, ctx) {
  const form = formModal(
    "Seal the campaign archive",
    `<p>Archive <strong>${esc(state.campaign.name)}</strong>?</p><p>The campaign will become read-only. Its map, factions, battle reports, photographs and chronicles remain available in the campaign archive.</p>${activeCampaign(state) ? '<p class="muted">This campaign is still active. Archiving ends further play without declaring a winner.</p>' : ""}`,
    "Archive campaign",
  );
  onSave(form, () => ctx.run({ type: "archive_campaign", payload: {} }));
}

async function showCampaigns(ctx) {
  modal(
    "Campaign archive",
    '<p class="muted">Retrieving campaign records…</p>',
  );
  try {
    const records = await ctx.store.listCampaigns();
    modal(
      "Campaign archive",
      `<div class="event-list">${records.length ? records.map((c) => `<article class="card"><div class="panel-head"><div><h4>${esc(c.name)}</h4><p class="muted">${esc(c.status)} · Turn ${esc(c.turn)}${c.started_at ? ` · ${esc(formatDate(c.started_at))}` : ""}</p></div>${c.id === ctx.store.state?.campaign.id ? '<span class="badge">Current campaign</span>' : button("Open campaign", `data-select-campaign="${esc(c.id)}"`)}</div></article>`).join("") : empty("No campaigns recorded", "Your campaigns will be preserved here.")}</div>`,
    );
    document.querySelectorAll("[data-select-campaign]").forEach((el) =>
      el.addEventListener("click", async () => {
        el.disabled = true;
        try {
          await ctx.store.selectCampaign(el.dataset.selectCampaign);
          closeModal();
          ctx.render();
        } catch (error) {
          toast(error.message, "error");
          el.disabled = false;
        }
      }),
    );
  } catch (error) {
    modal(
      "Campaign archive",
      `<p class="form-error" role="alert">${esc(error.message || "Unable to retrieve campaigns.")}</p>`,
    );
  }
}

function editEvent(state, ctx, id) {
  const event = state.events.find((e) => e.id === id) || {
    id: crypto.randomUUID(),
    duration: 1,
    active: false,
  };
  const form = formModal(
    id ? "Edit planetary event" : "Add planetary event",
    `${field("Event title", input("title", event.title, 'required maxlength="100"'))}${field("Narrative", textarea("description", event.description, 'required maxlength="4000"'))}${field("Optional house-rule effect", textarea("effect", event.effect, 'maxlength="2000"'))}<p class="muted">House rules only apply when gameplay modifiers are enabled.</p><div class="form-grid">${field("Duration in campaign turns", input("duration", event.duration, 'type="number" min="1" max="99" required'))}${id && event.active ? field("Turns remaining", input("remaining_turns", event.remaining_turns ?? event.duration, 'type="number" min="0" max="99" required')) : ""}</div>${id ? `<label class="check-field"><input type="checkbox" name="active" ${event.active ? "checked" : ""}> Event is active</label>` : '<p class="muted">The event will be added to the library. Select it from Planetary Events when you want it to begin.</p>'}`,
  );
  onSave(form, (values) =>
    ctx.run({
      type: "save_event",
      payload: {
        event: {
          ...event,
          ...values,
          title: values.title.trim(),
          duration: Number(values.duration),
          remaining_turns: Number(values.remaining_turns ?? values.duration),
          active: values.active === "on",
        },
      },
    }),
  );
}

function selectEvent(state, ctx, random = false) {
  const available = state.events.filter((event) => !event.active);
  if (!available.length) {
    toast(
      "Every event is already active. Add an event or wait for an active event to expire.",
      "error",
    );
    return;
  }
  const chosen = random
    ? available[Math.floor(Math.random() * available.length)]
    : available[0];
  const form = formModal(
    random ? "Planetary event detected" : "Activate a planetary event",
    `${field("Event", `<select name="event_id" required>${available.map((e) => `<option value="${esc(e.id)}" ${e.id === chosen.id ? "selected" : ""}>${esc(e.title)}</option>`).join("")}</select>`)}<div id="event-preview"></div>${button("Edit selected event", "data-edit-selected-event")}`,
    "Activate event",
  );
  const select = form.querySelector('[name="event_id"]');
  const preview = () => {
    const e = available.find((item) => item.id === select.value);
    form.querySelector("#event-preview").innerHTML =
      `<p>${esc(e.description)}</p><p class="muted">Duration: ${esc(e.duration)} campaign turns</p>${e.effect && state.settings.gameplay_modifiers_enabled ? `<p class="muted"><strong>Optional house rule:</strong> ${esc(e.effect)}</p>` : `<p class="muted">${state.settings.gameplay_modifiers_enabled ? "This event has no tabletop gameplay effect." : "Gameplay modifiers are disabled; this event is narrative only."}</p>`}`;
  };
  select.addEventListener("change", preview);
  form
    .querySelector("[data-edit-selected-event]")
    .addEventListener("click", () => editEvent(state, ctx, select.value));
  preview();
  onSave(form, (values) =>
    ctx.run({ type: "activate_event", payload: { id: values.event_id } }),
  );
}
