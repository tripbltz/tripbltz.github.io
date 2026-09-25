import { forcePoints, pointsLabel } from "./services/scenarios.js";
import {
  escapeHtml as e,
  field,
  modal,
  closeModal,
  toast,
  icon,
  formatDate,
  factionName,
  playerName,
  safeImage,
} from "./ui.js";
import { canAttack, resultConsequences, getStats } from "./engine.js";
const input = (name, value = "", extra = "") =>
  `<input name="${name}" value="${e(value)}" ${extra}>`;
const opts = (items, value) =>
  items
    .map(
      (x) =>
        `<option value="${e(x.id)}" ${x.id === value ? "selected" : ""}>${e(x.name)}</option>`,
    )
    .join("");
const ta = (name, value = "") =>
  `<textarea name="${name}">${e(value)}</textarea>`;
const dateToday = () => new Date().toLocaleDateString("en-CA");
export function createBattleUI(ctx) {
  function openNewBattle(territoryId, preferredAttackerId) {
    const s = ctx.store.state,
      actor = ctx.store.actor,
      eligible =
        actor?.role === "player"
          ? s.players.filter((p) => p.id === actor.player_id)
          : s.players;
    if (s.campaign.status !== "active") {
      toast("This campaign is closed to new engagements.", "error");
      return;
    }
    const initialAttacker =
      eligible.find((p) => p.id === preferredAttackerId) ||
      eligible.find(
        (p) =>
          p.id !== s.territories.find((t) => t.id === territoryId)?.owner_id,
      ) ||
      eligible[0];
    if (!initialAttacker) {
      toast("Add a commander before planning a battle.", "error");
      return;
    }
    const territory =
      s.territories.find((t) => t.id === territoryId) ||
      s.territories.find(
        (t) => canAttack(s, initialAttacker.id, t.id).allowed,
      ) ||
      s.territories[0];
    if (!territory) {
      toast("Create a territory in Campaign settings first.", "error");
      return;
    }
    modal(
      "Plan an engagement",
      `<form id="battle-form"><div class="form-grid">${field("Territory", `<select name="territory_id" id="battle-territory">${opts(s.territories, territory.id)}</select>`)}${field("Attacking commander", `<select name="attacker_id" id="battle-attacker">${opts(eligible, initialAttacker.id)}</select>`)}<div class="full-width notice" id="attack-check"></div>${field("Battle name", input("name", `Battle for ${territory.name}`, 'required maxlength="120"'))}${field("Date", input("date", dateToday(), 'type="date" required'))}${field("Attacking faction", `<select name="attacker_faction_id" id="attacker-faction" required></select>`)}${field("Defending faction", `<select name="defender_faction_id" id="defender-faction" required></select>`)}${field("Points per army", input("points", 1000, 'type="number" min="100" max="30000" step="50" required'))}${field("Status", `<select name="status"><option value="active">Active · ready to play</option><option value="planned">Planned · play later</option></select>`)}</div><div class="notice"><span class="eyebrow">TERRITORY SCENARIO · LOCKED</span><h3 id="territory-scenario-name"></h3><p class="help-text">This mission belongs to the territory being attacked.</p></div><div class="notice" id="asset-setup" hidden>${field("Baneblade player", `<select name="asset_side" id="asset-side" disabled><option value="defender">Defender escorts the Baneblade</option><option value="attacker">Attacker escorts the Baneblade</option></select>`)}<p id="asset-points" style="margin-top:12px"></p><p class="help-text">The Baneblade is included in its player's army allowance. The opposing force receives twice that allowance. Agree the possible escape zones, then roll for the destination only after both armies deploy. This selected mission's asymmetric forces apply independently of optional planetary-event modifiers.</p></div><div class="form-grid">${field("Mission", input("mission", "", "readonly required"))}${field("Deployment", input("deployment", "", "readonly"))}${field("Battlefield condition / narrative modifier", input("modifier", "", "readonly"))}${field("Campaign objective", input("campaign_objective", `Capture ${territory.name}.`))}</div><details><summary>Objectives & narrative details</summary><div class="form-grid">${field("Attacker objective", ta("attacker_objective", "Win the mission to capture this territory."))}${field("Defender objective", ta("defender_objective", "Win the mission to retain control."))}${field("Narrative notes", ta("notes"))}</div></details><p class="help-text">Narrative modifiers are optional house rules. Agree tabletop effects with your opponent before play.</p><div class="form-actions"><button class="btn btn-ghost" type="button" id="cancel-battle">Cancel</button><button class="btn btn-primary" id="save-battle">${icon("swords")}Create battle</button></div></form>`,
      { wide: true },
    );
    const form = document.querySelector("#battle-form");
    let defenderId,
      finalAssault = false;
    const syncAsset = (resetObjectives = false) => {
      const side = form.elements.asset_side;
      const enabled = !side.disabled;
      form.elements.points.closest("label").querySelector("span").textContent =
        enabled
          ? "Baneblade army points (including the Baneblade)"
          : "Points per army";
      if (!enabled) return;
      const points = forcePoints({
        points: form.elements.points.value,
        asset_side: side.value,
      });
      document.querySelector("#asset-points").textContent =
        `Attacker: ${playerName(s, form.elements.attacker_id.value)} — ${points.attacker.toLocaleString()} pts${side.value === "attacker" ? " · Baneblade" : ""}. Defender: ${playerName(s, defenderId)} — ${points.defender.toLocaleString()} pts${side.value === "defender" ? " · Baneblade" : ""}.`;
      if (resetObjectives) {
        const territory = s.territories.find(
          (t) => t.id === form.elements.territory_id.value,
        );
        const sc = s.scenarios.find((sc) => sc.id === territory.scenario_id);
        form.elements.attacker_objective.value =
          side.value === "defender"
            ? sc.attacker_objective
            : sc.defender_objective;
        form.elements.defender_objective.value =
          side.value === "defender"
            ? sc.defender_objective
            : sc.attacker_objective;
      }
    };
    const applyScenario = (sc) => {
      for (const [k, v] of Object.entries({
        mission: sc.mission,
        deployment: sc.deployment,
        modifier: sc.condition,
        notes: sc.narrative,
        attacker_objective: sc.attacker_objective,
        defender_objective: sc.defender_objective,
      }))
        if (form.elements[k]) form.elements[k].value = v || "";
      const assetScenario = sc.mission?.toLowerCase() === "destroy the asset";
      document.querySelector("#asset-setup").hidden = !assetScenario;
      form.elements.asset_side.disabled = !assetScenario;
      form.elements.asset_side.value = "defender";
      document.querySelector("#territory-scenario-name").textContent = sc.title;
      syncAsset(assetScenario);
    };
    const update = () => {
      const attackerId = form.elements.attacker_id.value,
        t = s.territories.find(
          (t) => t.id === form.elements.territory_id.value,
        );
      defenderId = t.owner_id || s.players.find((p) => p.id !== attackerId)?.id;
      form.elements.attacker_faction_id.innerHTML = opts(
        s.factions.filter((f) => f.player_id === attackerId),
      );
      form.elements.defender_faction_id.innerHTML = opts(
        s.factions.filter((f) => f.player_id === defenderId),
      );
      finalAssault = !!(
        t.headquarters_for &&
        t.headquarters_for !== attackerId &&
        s.settings.final_assault_enabled &&
        getStats(s).players.find((p) => p.id === attackerId)?.domination >=
          s.settings.domination_threshold
      );
      const check = canAttack(s, attackerId, t.id, { finalAssault });
      document
        .querySelector("#attack-check")
        .classList.toggle("error", !check.allowed);
      document.querySelector("#attack-check").innerHTML =
        `<strong>${finalAssault ? "THE FINAL ASSAULT" : e(t.name) + " · " + "★".repeat(t.strategic_value)}</strong>Current control: ${e(playerName(s, t.owner_id))} · Defender: ${e(playerName(s, defenderId))}<br>${check.allowed ? (finalAssault ? "Victory ends the campaign. Defeat costs " + s.settings.final_assault_penalty + " territories." : "Attack authorised. Victory captures this territory; a draw leaves control unchanged.") : e(check.reason)}`;
      form.elements.name.value = `${finalAssault ? "The Final Assault on" : "Battle for"} ${t.name}`;
      form.elements.campaign_objective.value = finalAssault
        ? "Win the Final Assault to claim Christopia."
        : `Capture ${t.name}.`;
      document.querySelector("#save-battle").disabled = !check.allowed;
      const scenario = s.scenarios.find((sc) => sc.id === t.scenario_id);
      if (scenario) applyScenario(scenario);
      else {
        document.querySelector("#territory-scenario-name").textContent =
          "No scenario assigned — contact campaign admin";
        document.querySelector("#save-battle").disabled = true;
      }
    };
    form.elements.attacker_objective.readOnly = true;
    form.elements.defender_objective.readOnly = true;
    form.elements.asset_side.onchange = () => syncAsset(true);
    form.elements.points.oninput = () => syncAsset();
    document.querySelector("#battle-territory").onchange = () => {
      update();
      syncAsset();
    };
    document.querySelector("#battle-attacker").onchange = () => {
      update();
      syncAsset();
    };
    update();
    document.querySelector("#cancel-battle").onclick = closeModal;
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const data = Object.fromEntries(new FormData(form)),
        id = crypto.randomUUID();
      const payload = {
        ...data,
        id,
        defender_id: defenderId,
        points: Number(data.points),
        turn: s.campaign.turn,
        is_final_assault: finalAssault,
      };
      const btn = document.querySelector("#save-battle");
      btn.disabled = true;
      if (await ctx.run({ type: "create_battle", payload })) {
        closeModal();
        location.hash = "battles";
        openBattle(id);
      } else btn.disabled = false;
    };
  }
  function openBattle(id) {
    const s = ctx.store.state,
      b = s.battles.find((b) => b.id === id);
    if (!b) return;
    const t = s.territories.find((t) => t.id === b.territory_id),
      photos = s.photos.filter((p) => p.battle_id === id),
      canEdit =
        s.campaign.status !== "archived" &&
        (!ctx.store.actor ||
          ctx.store.actor.role === "admin" ||
          [b.attacker_id, b.defender_id].includes(ctx.store.actor.player_id));
    modal(
      b.name,
      `<div class="toolbar"><span class="badge ${b.status}">${b.status}</span><span class="eyebrow">${e(t?.name)} / ${pointsLabel(b)} PTS / ${formatDate(b.date)}</span>${b.is_final_assault ? '<span class="badge">FINAL ASSAULT</span>' : ""}</div><div class="versus"><div><p>${e(playerName(s, b.attacker_id))} · ATTACKER · ${forcePoints(b).attacker.toLocaleString()} PTS${b.asset_side === "attacker" ? " · BANEBLADE" : ""}</p><h3>${e(factionName(s, b.attacker_faction_id))}</h3>${b.status === "completed" ? `<strong>${b.attacker_score}</strong>` : ""}</div><span>VS</span><div><p>${e(playerName(s, b.defender_id))} · DEFENDER · ${forcePoints(b).defender.toLocaleString()} PTS${b.asset_side === "defender" ? " · BANEBLADE" : ""}</p><h3>${e(factionName(s, b.defender_faction_id))}</h3>${b.status === "completed" ? `<strong>${b.defender_score}</strong>` : ""}</div></div>${b.status === "completed" ? `<div class="notice"><strong>${b.result === "draw" ? "A HARD-FOUGHT DRAW" : e(playerName(s, b.winner_id)).toUpperCase() + " VICTORIOUS"}</strong>${b.rounds} battle rounds${b.mvp ? " · MVP: " + e(b.mvp) : ""}</div>` : ""}<div class="report-objectives"><div><p class="eyebrow">Mission / Deployment</p><p>${e(b.mission)} · ${e(b.deployment)}</p></div><div><p class="eyebrow">Campaign stakes</p><p>${e(b.campaign_objective || "Attacker victory captures the territory. Defender victory retains control.")}</p></div><div><p class="eyebrow">Attacker objective</p><p>${e(b.attacker_objective || "Win the mission.")}</p></div><div><p class="eyebrow">Defender objective</p><p>${e(b.defender_objective || "Win the mission.")}</p></div></div>${b.custom_objective ? `<div class="notice"><strong>Custom objective</strong>${e(b.custom_objective)}</div>` : ""}${b.asset_side ? `<div class="notice"><strong>Destroy the asset · Baneblade escape</strong>${e(playerName(s, b.asset_side === "attacker" ? b.attacker_id : b.defender_id))} must escape with the Baneblade. Roll for the designated escape zone after both armies deploy. The opposing army has twice the Baneblade army’s points allowance. Destroy the Baneblade before it escapes to win as the opposing commander.</div>` : ""}${b.modifier && !b.asset_side ? `<div class="notice"><strong>${e(b.modifier)}</strong>Optional house rule · ${s.settings.gameplay_modifiers_enabled ? "agree any tabletop effect together." : "tabletop gameplay modifiers are disabled."}</div>` : ""}${b.moment ? `<div class="section-heading"><h3>The moment that mattered</h3></div><p class="narrative">${e(b.moment)}</p>` : ""}${b.notes ? `<div class="section-heading"><h3>Field report</h3></div><p class="narrative">${e(b.notes)}</p>` : ""}${b.casualties || b.units_destroyed ? `<p class="help-text">Casualties: ${e(b.casualties || "None recorded")} · Enemy units destroyed: ${e(b.units_destroyed || 0)}</p>` : ""}<div class="section-heading"><h3>Pict-captures <span class="muted">/ ${photos.length}</span></h3>${canEdit ? '<button class="btn btn-sm" id="upload-photos">' + icon("upload") + "Add photographs</button>" : ""}</div><div class="photo-grid">${photos.map((p) => `<button class="photo-card" data-report-photo="${p.id}"><img loading="lazy" src="${safeImage(p.url)}" alt="${e(p.caption || b.name)}"><div class="photo-caption">${e(p.caption || "View photograph")}</div></button>`).join("")}</div>${!photos.length ? '<p class="help-text">No pict-captures yet. Add photographs from your tabletop battle.</p>' : ""}<div class="form-actions">${canEdit && ctx.store.actor?.role !== "player" && b.status === "completed" ? '<button class="btn btn-ghost" id="edit-report">Edit battle report</button>' : ""}${canEdit && b.status === "planned" ? '<button class="btn" id="start-battle">Start battle</button>' : ""}${canEdit && b.status !== "completed" ? '<button class="btn btn-primary" id="complete-battle">' + icon("check") + "Complete battle</button>" : ""}<button class="btn btn-ghost" id="close-report">Close report</button></div>`,
      { wide: true },
    );
    document.querySelector("#close-report").onclick = closeModal;
    document
      .querySelector("#complete-battle")
      ?.addEventListener("click", () => quickResult(id));
    document
      .querySelector("#start-battle")
      ?.addEventListener("click", async () => {
        if (await ctx.run({ type: "start_battle", payload: { id } }))
          openBattle(id);
      });
    document
      .querySelector("#upload-photos")
      ?.addEventListener("click", () => uploadPhotos(id));
    document
      .querySelector("#edit-report")
      ?.addEventListener("click", () => editReport(id));
    document
      .querySelectorAll("[data-report-photo]")
      .forEach(
        (btn) => (btn.onclick = () => openPhoto(btn.dataset.reportPhoto)),
      );
  }
  function quickResult(id, saved) {
    const s = ctx.store.state,
      b = s.battles.find((b) => b.id === id),
      data = saved || {
        result: "attacker",
        attacker_score: 0,
        defender_score: 0,
        rounds: 5,
        mvp: "",
        moment: "",
        notes: b.notes || "",
        casualties: "",
        units_destroyed: 0,
        resources_earned: s.settings.resources_enabled ? 1 : 0,
      };
    modal(
      "Record the result",
      `<form id="result-form"><p class="eyebrow">QUICK RESULT / ${e(b.name)}</p><div class="form-grid" style="margin-top:20px">${field("Battle outcome", `<select name="result"><option value="attacker" ${data.result === "attacker" ? "selected" : ""}>${e(playerName(s, b.attacker_id))} wins · Attacker</option><option value="defender" ${data.result === "defender" ? "selected" : ""}>${e(playerName(s, b.defender_id))} wins · Defender</option><option value="draw" ${data.result === "draw" ? "selected" : ""}>Draw · Control unchanged</option></select>`)}${field("Rounds completed", input("rounds", data.rounds, 'type="number" min="1" max="10" required'))}${field(playerName(s, b.attacker_id) + " score", input("attacker_score", data.attacker_score, 'type="number" min="0" max="999" required'))}${field(playerName(s, b.defender_id) + " score", input("defender_score", data.defender_score, 'type="number" min="0" max="999" required'))}</div><details ${saved ? "open" : ""}><summary>Add battle details · optional</summary><div class="form-grid">${field("MVP unit", input("mvp", data.mvp))}${field("Enemy units destroyed by the winner", input("units_destroyed", data.units_destroyed, 'type="number" min="0" max="999"'))}${field("Favourite moment", ta("moment", data.moment))}${field("Casualties", ta("casualties", data.casualties))}<div class="full-width">${field("Notes", ta("notes", data.notes))}</div>${s.settings.resources_enabled ? field("Resources earned by winner", input("resources_earned", data.resources_earned, 'type="number" min="0" max="10"')) : ""}</div></details><p class="help-text">The next screen previews every campaign consequence before saving. Upload photographs from the report after completion.</p><div class="form-actions"><button class="btn btn-ghost" type="button" id="result-back">Go back</button><button class="btn btn-primary">Review campaign consequences ${icon("arrow")}</button></div></form>`,
    );
    document.querySelector("#result-back").onclick = () => openBattle(id);
    document.querySelector("#result-form").onsubmit = (ev) => {
      ev.preventDefault();
      const payload = { id, ...Object.fromEntries(new FormData(ev.target)) };
      [
        "attacker_score",
        "defender_score",
        "rounds",
        "units_destroyed",
        "resources_earned",
      ].forEach((k) => (payload[k] = Number(payload[k] || 0)));
      previewResult(id, payload);
    };
  }
  function previewResult(id, payload) {
    try {
      const preview = resultConsequences(ctx.store.state, id, payload);
      modal(
        "Campaign consequences",
        `<p class="eyebrow">VERIFY THE FIELD REPORT</p><div class="result-summary">${e(preview.text)}</div><p class="help-text">This completes the battle, updates the map and records the result in the Chronicles of Christopia.</p><div class="form-actions"><button class="btn btn-ghost" id="preview-back">Go back</button><button class="btn btn-primary" id="confirm-result">${icon("check")}Confirm result</button></div>`,
      );
      document.querySelector("#preview-back").onclick = () =>
        quickResult(id, payload);
      document.querySelector("#confirm-result").onclick = async () => {
        const btn = document.querySelector("#confirm-result");
        btn.disabled = true;
        btn.textContent = "Transmitting result…";
        if (await ctx.run({ type: "complete_battle", payload })) {
          openBattle(id);
          toast("Result confirmed. The story of Christopia continues.");
        } else {
          btn.disabled = false;
          btn.textContent = "Confirm result";
        }
      };
    } catch (err) {
      toast(err.message, "error");
    }
  }
  function editReport(id) {
    const b = ctx.store.state.battles.find((b) => b.id === id);
    modal(
      "Edit battle report",
      `<form id="edit-report-form"><div class="form-grid">${field("Battle name", input("name", b.name, "required"))}${field("MVP", input("mvp", b.mvp))}${field("Favourite moment", ta("moment", b.moment))}${field("Notes", ta("notes", b.notes))}</div><p class="help-text">The most recent standard battle in this turn can have its winner corrected if no later territory changes or resource spending depend on it. Earlier outcomes and Final Assault outcomes are locked to preserve campaign history.</p><details><summary>Correct the recorded result</summary><div class="form-grid">${field("Winner", `<select name="result"><option value="attacker" ${b.result === "attacker" ? "selected" : ""}>Attacker</option><option value="defender" ${b.result === "defender" ? "selected" : ""}>Defender</option><option value="draw" ${b.result === "draw" ? "selected" : ""}>Draw</option></select>`)}${field("Attacker score", input("attacker_score", b.attacker_score, 'type="number" min="0" required'))}${field("Defender score", input("defender_score", b.defender_score, 'type="number" min="0" required'))}</div></details><div class="form-actions"><button class="btn btn-primary">Save report</button></div></form>`,
    );
    document.querySelector("#edit-report-form").onsubmit = async (ev) => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(ev.target));
      d.attacker_score = Number(d.attacker_score);
      d.defender_score = Number(d.defender_score);
      const command = {
        type: "edit_battle",
        payload: { battle: { ...b, ...d } },
      };
      if (d.result !== b.result) {
        modal(
          "Confirm result correction",
          `<div class="notice"><strong>${e(b.result)} → ${e(d.result)}</strong>The old resource award and territory capture will be reversed, then the corrected outcome applied. Statistics and the Chronicle will update; the original dispatch remains in the audit record.</div><div class="form-actions"><button class="btn btn-ghost" id="correction-back">Go back</button><button class="btn btn-primary" id="confirm-correction">Confirm correction</button></div>`,
        );
        document.querySelector("#correction-back").onclick = () =>
          editReport(id);
        document.querySelector("#confirm-correction").onclick = async () => {
          document.querySelector("#confirm-correction").disabled = true;
          if (await ctx.run(command)) openBattle(id);
          else document.querySelector("#confirm-correction").disabled = false;
        };
      } else if (await ctx.run(command)) openBattle(id);
    };
  }
  function uploadPhotos(battleId) {
    modal(
      "Transmit pict-captures",
      `<form id="photo-upload-form">${field("Battle photographs", '<input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple required>')}${field("Caption (applies to this selection)", input("caption", "", 'maxlength="300" placeholder="A moment from the front line…"'))}<p class="help-text">JPEG, PNG and WebP files are resized before upload. Photos remain private to your campaign.</p><div class="notice hidden" id="upload-progress" role="status"></div><div class="form-actions"><button type="button" class="btn btn-ghost" id="upload-back">Go back</button><button class="btn btn-primary">Upload photographs</button></div></form>`,
    );
    document.querySelector("#upload-back").onclick = () => openBattle(battleId);
    document.querySelector("#photo-upload-form").onsubmit = async (ev) => {
      ev.preventDefault();
      const form = ev.target,
        files = [...form.elements.photos.files],
        caption = form.elements.caption.value;
      form.querySelectorAll("button").forEach((b) => (b.disabled = true));
      const progress = document.querySelector("#upload-progress");
      progress.classList.remove("hidden");
      let done = 0;
      try {
        for (const file of files) {
          progress.textContent = `Transmitting photograph ${done + 1} of ${files.length}…`;
          await ctx.store.uploadPhoto(file, battleId, caption);
          done++;
        }
        ctx.render();
        toast(
          `${done} photograph${done !== 1 ? "s" : ""} added to the battle report.`,
        );
        openBattle(battleId);
      } catch (err) {
        progress.classList.add("error");
        progress.textContent = `${done} of ${files.length} uploaded. ${err.message} Successfully uploaded files are already saved. Select only the remaining files to retry.`;
        form.querySelectorAll("button").forEach((b) => (b.disabled = false));
        ctx.render();
      }
    };
  }
  function openPhoto(id) {
    const s = ctx.store.state,
      p = s.photos.find((p) => p.id === id);
    if (!p) return;
    const b = s.battles.find((b) => b.id === p.battle_id),
      t = s.territories.find((t) => t.id === b?.territory_id),
      editable =
        s.campaign.status !== "archived" &&
        (ctx.store.actor?.role !== "player" ||
          [b?.attacker_id, b?.defender_id].includes(ctx.store.actor.player_id));
    modal(
      p.caption || "Pict-capture",
      `<img class="lightbox-image" src="${safeImage(p.url)}" alt="${e(p.caption || b?.name)}"><p class="help-text">${e(b?.name)} · ${e(t?.name)} · ${formatDate(b?.date)}</p><div class="form-actions">${editable ? '<button class="btn btn-danger" id="remove-photo">Remove photograph</button>' : ""}<button class="btn" id="photo-report">View battle report</button></div>`,
      { wide: true },
    );
    document.querySelector("#photo-report").onclick = () =>
      openBattle(p.battle_id);
    document.querySelector("#remove-photo")?.addEventListener("click", () => {
      modal(
        "Remove pict-capture?",
        `<p>This removes the photograph from the battle report and campaign gallery.</p><div class="form-actions"><button class="btn" id="keep-photo">Keep photograph</button><button class="btn btn-danger" id="delete-photo">Remove photograph</button></div>`,
      );
      document.querySelector("#keep-photo").onclick = () => openPhoto(id);
      document.querySelector("#delete-photo").onclick = async () => {
        try {
          document.querySelector("#delete-photo").disabled = true;
          await ctx.store.deletePhoto(id);
          ctx.render();
          openBattle(p.battle_id);
          toast("Photograph removed.");
        } catch (err) {
          toast(err.message, "error");
          document.querySelector("#delete-photo").disabled = false;
        }
      };
    });
  }
  return { openNewBattle, openBattle, openPhoto };
}
export function renderBattles(s, filter = {}) {
  const matches = s.battles.filter(
    (b) =>
      (!filter.search ||
        (
          b.name +
          " " +
          factionName(s, b.attacker_faction_id) +
          " " +
          factionName(s, b.defender_faction_id)
        )
          .toLowerCase()
          .includes(filter.search.toLowerCase())) &&
      (!filter.player ||
        [b.attacker_id, b.defender_id].includes(filter.player)) &&
      (!filter.status || b.status === filter.status),
  );
  return `<div class="toolbar"><label class="sr-only" for="battle-search">Search battles</label><input id="battle-search" type="search" placeholder="Search engagements, factions…" value="${e(filter.search || "")}"><select id="battle-player" aria-label="Filter by player"><option value="">All commanders</option>${opts(s.players, filter.player)}</select><select id="battle-status" aria-label="Filter by battle status"><option value="">All engagements</option>${["active", "planned", "completed"].map((x) => `<option value="${x}" ${filter.status === x ? "selected" : ""}>${x[0].toUpperCase() + x.slice(1)} battles</option>`).join("")}</select></div>${[
    "active",
    "planned",
    "completed",
  ]
    .filter((status) => !filter.status || filter.status === status)
    .map((status) => {
      const battles = matches
        .filter((b) => b.status === status)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      return `<section><div class="section-heading"><h2>${status.toUpperCase()} BATTLES <span class="muted">/ ${String(battles.length).padStart(2, "0")}</span></h2><span class="eyebrow">${status === "active" ? "ON THE FRONT LINE" : status === "planned" ? "ORDERS RECEIVED" : "IN THE IMPERIAL RECORD"}</span></div>${
        battles.length
          ? `<div class="card-grid">${battles
              .map((b) => {
                const photo = s.photos.find((p) => p.battle_id === b.id);
                return `<button class="card battle-card" data-battle="${b.id}">${photo ? `<img class="battle-thumb" src="${safeImage(photo.url)}" alt="">` : ""}<div class="battle-card-top"><span class="badge ${b.status}">${b.is_final_assault ? "Final assault" : b.status}</span><h3>${e(b.name)}</h3><span class="eyebrow">${e(s.territories.find((t) => t.id === b.territory_id)?.type || "Territory engagement")}</span></div><div class="battle-card-middle"><div class="battle-card-faction">${e(factionName(s, b.attacker_faction_id))}<small>${e(playerName(s, b.attacker_id))}</small></div><strong>${status === "completed" ? b.attacker_score + "–" + b.defender_score : "VS"}</strong><div class="battle-card-faction">${e(factionName(s, b.defender_faction_id))}<small>${e(playerName(s, b.defender_id))}</small></div></div><div class="battle-card-footer"><span>${pointsLabel(b)} PTS · TURN ${b.turn}</span><span>${formatDate(b.date)}</span></div></button>`;
              })
              .join("")}</div>`
          : `<div class="empty-state"><h3>NO ${status.toUpperCase()} ENGAGEMENTS</h3><p>${status === "completed" ? "The next chapter is waiting to be written." : "Plan an attack from the planetary map."}</p></div>`
      }</section>`;
    })
    .join("")}`;
}
