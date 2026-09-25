import {
  escapeHtml as e,
  field,
  modal,
  closeModal,
  toast,
  icon,
  safeColor,
} from "./ui.js";
const input = (name, value = "", extra = "") =>
  `<input name="${name}" value="${e(value)}" ${extra}>`;
const select = (name, items, value, empty) =>
  `<select name="${name}">${empty ? `<option value="">${empty}</option>` : ""}${items.map((x) => `<option value="${e(x.id ?? x)}" ${(x.id ?? x) === value ? "selected" : ""}>${e(x.name ?? x)}</option>`).join("")}</select>`;
export function openSettings(ctx, tab = "rules") {
  const s = ctx.store.state;
  if (s.campaign.status !== "active") tab = "data";
  if (ctx.store.actor?.role === "player") {
    toast(
      "Only the campaign administrator can edit campaign settings.",
      "error",
    );
    return;
  }
  modal(
    "Campaign command",
    `<div class="settings-tabs">${(s.campaign.status === "active" ? ["rules", "territories", "players", "scenarios", "data"] : ["data"]).map((x) => `<button class="btn btn-ghost ${tab === x ? "active" : ""}" data-settings-tab="${x}">${x[0].toUpperCase() + x.slice(1)}</button>`).join("")}</div><div id="settings-content"></div>`,
    { wide: true },
  );
  document
    .querySelectorAll("[data-settings-tab]")
    .forEach(
      (b) => (b.onclick = () => openSettings(ctx, b.dataset.settingsTab)),
    );
  const panel = document.querySelector("#settings-content");
  if (tab === "rules") {
    const checks = {
      resources_enabled: "Campaign resources",
      random_events_enabled: "Planetary events",
      gameplay_modifiers_enabled: "Optional tabletop house rules",
      final_assault_enabled: "The Final Assault",
    };
    panel.innerHTML = `<p class="settings-explainer">Adjust the strategic layer together. Gameplay modifiers are optional house rules; narrative events remain available when they are disabled.</p><form id="rules-form"><div class="form-grid">${field("Attacks per player, per turn", input("attacks_per_turn", s.settings.attacks_per_turn, 'type="number" min="1" max="20" required'))}${field("Domination threshold (%)", input("domination_threshold", s.settings.domination_threshold, 'type="number" min="1" max="100" required'))}${field("Failed Final Assault · territories lost", input("final_assault_penalty", s.settings.final_assault_penalty, 'type="number" min="0" max="20" required'))}<div>${Object.entries(
      checks,
    )
      .map(
        ([k, v]) =>
          `<label class="check-label"><input type="checkbox" name="${k}" ${s.settings[k] ? "checked" : ""}>${v}</label>`,
      )
      .join(
        "",
      )}</div></div><div class="form-actions"><button class="btn btn-primary">Save campaign rules</button></div></form>`;
    document.querySelector("#rules-form").onsubmit = async (ev) => {
      ev.preventDefault();
      const d = new FormData(ev.target),
        settings = { ...s.settings };
      [
        "attacks_per_turn",
        "domination_threshold",
        "final_assault_penalty",
      ].forEach((k) => (settings[k] = Number(d.get(k))));
      Object.keys(checks).forEach((k) => (settings[k] = d.has(k)));
      if (await ctx.run({ type: "save_settings", payload: { settings } }))
        closeModal();
    };
  } else if (tab === "territories") {
    panel.innerHTML = `<div class="toolbar"><button class="btn btn-primary" id="add-location">${icon("plus")}Add territory</button><button class="btn" id="edit-map">${icon("target")}Move map markers</button></div><div class="editor-list">${s.territories.map((t) => `<div class="editor-item"><div><h3>${e(t.name)}</h3><p>${e(t.type)} · ${t.strategic_value} strategic value · ${e(s.players.find((p) => p.id === t.owner_id)?.name || "Neutral")}</p></div><button class="btn btn-sm" data-edit-territory="${t.id}">Edit</button></div>`).join("")}</div>`;
    document.querySelector("#add-location").onclick = () => editTerritory(ctx);
    document.querySelector("#edit-map").onclick = () => {
      closeModal();
      ctx.editMap();
    };
    document
      .querySelectorAll("[data-edit-territory]")
      .forEach(
        (b) => (b.onclick = () => editTerritory(ctx, b.dataset.editTerritory)),
      );
  } else if (tab === "players") {
    panel.innerHTML = `<p class="settings-explainer">Player colours identify control throughout the atlas. ${ctx.store.mode === "cloud" ? "Invite a registered account by email to connect a commander to a Supabase login." : "In demo mode, you can play as either commander. Supabase mode adds private player accounts."}</p><div class="editor-list">${s.players.map((p) => `<div class="editor-item"><div><h3 style="color:${safeColor(p.color)}">${e(p.name)}</h3><p>${e(p.role)} · ${p.resources} resources</p></div><button class="btn" data-player="${p.id}">Edit commander</button></div>`).join("")}</div>`;
    document
      .querySelectorAll("[data-player]")
      .forEach((b) => (b.onclick = () => editPlayer(ctx, b.dataset.player)));
  } else if (tab === "scenarios") {
    panel.innerHTML = `<div class="toolbar"><button class="btn btn-primary" id="add-scenario">Add scenario</button></div><div class="editor-list">${s.scenarios.map((x) => `<div class="editor-item"><div><h3>${e(x.title)}</h3><p>${e(x.mission)} · ${e(x.condition)}</p></div><button class="btn" data-scenario="${x.id}">Edit</button></div>`).join("")}</div>`;
    document.querySelector("#add-scenario").onclick = () => editScenario(ctx);
    document
      .querySelectorAll("[data-scenario]")
      .forEach(
        (b) => (b.onclick = () => editScenario(ctx, b.dataset.scenario)),
      );
  } else {
    panel.innerHTML = `<div class="notice"><strong>${ctx.store.mode === "demo" ? "LOCAL DEMO · THIS BROWSER ONLY" : "SUPABASE · PRIVATE CAMPAIGN"}</strong>${ctx.store.mode === "demo" ? "Your campaign and photographs are saved in this browser. Export a backup before clearing browser data. Connect Supabase in config.js for two-player sync." : "Campaign commands are verified by the server and saved atomically. Photographs use private storage."}</div><div class="toolbar"><button class="btn" id="export-campaign">${icon("download")}Export campaign backup</button><button class="btn btn-primary" id="new-campaign">${icon("plus")}Create a new campaign</button></div><p class="help-text">Creating a campaign preserves every existing campaign. Archived campaigns can be opened from Campaign → View campaigns.</p>`;
    document.querySelector("#export-campaign").onclick = () => {
      const blob = new Blob([JSON.stringify(s, null, 2)], {
          type: "application/json",
        }),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `christopia-turn-${s.campaign.turn}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Campaign backup exported.");
    };
    document.querySelector("#new-campaign").onclick = () => openSetup(ctx);
  }
}
export function editTerritory(ctx, id) {
  const s = ctx.store.state,
    t = s.territories.find((t) => t.id === id) || {
      id: crypto.randomUUID(),
      name: "",
      type: "Outpost",
      strategic_value: 1,
      x: 50,
      y: 50,
      bonus_key: "none",
      owner_id: null,
      description: "",
      contested: false,
      capture_count: 0,
    };
  const neighbours = s.connections
    .filter((c) => c.territory_a === t.id || c.territory_b === t.id)
    .map((c) => (c.territory_a === t.id ? c.territory_b : c.territory_a));
  modal(
    id ? "Territory designation" : "Establish a new territory",
    `<form id="territory-form"><div class="form-grid">${field("Location name", input("name", t.name, 'required maxlength="100"'))}${field("Territory type", input("type", t.type, 'required maxlength="60" list="territory-types"'))}<datalist id="territory-types">${["Hive city", "Fortress", "Wasteland", "Manufactorum", "Spaceport", "Command bastion", "Refinery", "Outpost"].map((t) => `<option>${t}</option>`).join("")}</datalist>${field("Strategic value", input("strategic_value", t.strategic_value, 'type="number" min="1" max="5" required'))}${field("Current owner", select("owner_id", s.players, t.owner_id, "Neutral"))}${field(
      "Fixed territory scenario",
      select(
        "scenario_id",
        s.scenarios.map((sc) => ({ id: sc.id, name: sc.title })),
        t.scenario_id,
      ),
    )}${field("Territory image URL (optional)", input("image_url", t.image_url, 'type="url" placeholder="https://…"'))}${field(
      "Campaign effect",
      select(
        "bonus_key",
        [
          { id: "none", name: "No special effect" },
          { id: "resource", name: "Production · +1 resource per turn" },
          { id: "spaceport", name: "Spaceport · attack anywhere" },
          { id: "defence", name: "Defensive advantage · narrative" },
          { id: "domination", name: "Hive city · domination value" },
        ],
        t.bonus_key,
      ),
    )}${field("Headquarters for", select("headquarters_for", s.players, t.headquarters_for, "Not a headquarters"))}${field("Map horizontal position (%)", input("x", t.x, 'type="number" min="5" max="95" step="0.1" required'))}${field("Map vertical position (%)", input("y", t.y, 'type="number" min="5" max="95" step="0.1" required'))}<div class="full-width">${field("Description", `<textarea name="description">${e(t.description)}</textarea>`)}</div><label class="check-label"><input type="checkbox" name="contested" ${t.contested ? "checked" : ""}>Contested territory</label><label class="check-label"><input type="checkbox" name="fortified" ${t.fortified ? "checked" : ""}>Fortified</label><div class="full-width"><p class="eyebrow">Connected territories</p><div class="neighbour-grid">${s.territories
      .filter((x) => x.id !== t.id)
      .map(
        (x) =>
          `<label class="check-label"><input type="checkbox" name="neighbour" value="${x.id}" ${neighbours.includes(x.id) ? "checked" : ""}>${e(x.name)}</label>`,
      )
      .join(
        "",
      )}</div></div></div><div class="form-actions"><button class="btn btn-primary">Save territory</button></div></form>`,
    { wide: true },
  );
  document.querySelector("#territory-form").onsubmit = async (ev) => {
    ev.preventDefault();
    const d = new FormData(ev.target),
      territory = { ...t, ...Object.fromEntries(d) };
    ["x", "y", "strategic_value"].forEach(
      (k) => (territory[k] = Number(d.get(k))),
    );
    territory.owner_id = d.get("owner_id") || null;
    territory.headquarters_for = d.get("headquarters_for") || null;
    territory.contested = d.has("contested");
    territory.fortified = d.has("fortified");
    delete territory.neighbour;
    if (
      await ctx.run({
        type: "save_territory",
        payload: { territory, neighbours: d.getAll("neighbour") },
      })
    )
      closeModal();
  };
}
function editPlayer(ctx, id) {
  const p = ctx.store.state.players.find((p) => p.id === id);
  modal(
    "Commander profile",
    `<form id="player-form"><div class="form-grid">${field("Commander name", input("name", p.name, 'required maxlength="60"'))}${field("Campaign colour", input("color", p.color, 'type="color"'))}${field("Campaign role", select("role", ["admin", "player"], p.role))}${field("Campaign resources", input("resources", p.resources, 'type="number" min="0" max="999"'))}</div><div class="form-actions"><button class="btn btn-primary">Save commander</button></div></form>${ctx.store.mode === "cloud" ? `<hr class="divider"><form id="invite-form">${field("Connect a registered player by email", input("email", "", 'type="email" required placeholder="commander@example.com"'))}<p class="help-text">The other player must create an account on this app first. This assigns them to this commander.</p><div class="form-actions"><button class="btn">Connect account</button></div></form>` : ""}`,
  );
  document.querySelector("#player-form").onsubmit = async (ev) => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(ev.target));
    if (
      await ctx.run({
        type: "save_player",
        payload: { player: { ...p, ...d, resources: Number(d.resources) } },
      })
    )
      closeModal();
  };
  document
    .querySelector("#invite-form")
    ?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        await ctx.store.invitePlayer(new FormData(ev.target).get("email"), id);
        toast("Player account connected.");
        closeModal();
        ctx.render();
      } catch (err) {
        toast(err.message, "error");
      }
    });
}
function editScenario(ctx, id) {
  const x = ctx.store.state.scenarios.find((x) => x.id === id) || {
    id: crypto.randomUUID(),
    title: "",
    mission: "Take and Hold",
    deployment: "Dawn of War",
    condition: "",
    narrative: "",
    attacker_objective: "",
    defender_objective: "",
  };
  modal(
    "Scenario archive",
    `<form id="scenario-form"><div class="form-grid">${field("Title", input("title", x.title, "required"))}${field("Mission", input("mission", x.mission, "required"))}${field("Deployment", input("deployment", x.deployment))}${field("Battlefield condition", input("condition", x.condition))}<div class="full-width">${field("Narrative", `<textarea name="narrative">${e(x.narrative)}</textarea>`)}</div>${field("Attacker objective", `<textarea name="attacker_objective">${e(x.attacker_objective)}</textarea>`)}${field("Defender objective", `<textarea name="defender_objective">${e(x.defender_objective)}</textarea>`)}</div><div class="form-actions"><button class="btn btn-primary">Save scenario</button></div></form>`,
    { wide: true },
  );
  document.querySelector("#scenario-form").onsubmit = async (ev) => {
    ev.preventDefault();
    if (
      await ctx.run({
        type: "save_scenario",
        payload: {
          scenario: { ...x, ...Object.fromEntries(new FormData(ev.target)) },
        },
      })
    )
      closeModal();
  };
}
export function openSetup(ctx) {
  let step = 1;
  const values = {
    name: "The War for Christopia",
    players: [
      { name: "Chris", color: "#779eae", faction: "Astra Militarum" },
      { name: "Player Two", color: "#ba715d", faction: "Orks" },
    ],
    settings: {
      attacks_per_turn: 2,
      domination_threshold: 70,
      final_assault_penalty: 3,
      resources_enabled: true,
      random_events_enabled: true,
      unit_tracking_enabled: false,
      gameplay_modifiers_enabled: false,
      final_assault_enabled: true,
    },
  };
  const draw = () => {
    modal(
      "Welcome, commander.",
      `<div class="setup-steps"><span class="${step === 1 ? "active" : ""}">01 / CAMPAIGN</span><span class="${step === 2 ? "active" : ""}">02 / COMMANDERS</span><span class="${step === 3 ? "active" : ""}">03 / DEPLOYMENT</span></div><form id="setup-form">${
        step === 1
          ? `<p class="muted">A world at war. A history yet to be written.</p><div class="field-group">${field("Campaign name", input("name", values.name, 'required maxlength="100"'))}</div><p class="help-text">Twelve strategic locations will be seeded across Christopia. Each player starts with a headquarters and adjoining territories. Edit their ownership and connections in Campaign settings.</p>`
          : step === 2
            ? values.players
                .map(
                  (p, i) =>
                    `<fieldset class="setup-player"><legend class="eyebrow">Commander ${i + 1}</legend><div class="form-grid">${field("Player name", input(`name${i}`, p.name, "required"))}${field("Faction", input(`faction${i}`, p.faction, "required"))}${field("Campaign colour", input(`color${i}`, p.color, 'type="color"'))}</div></fieldset>`,
                )
                .join("")
            : `<div class="notice"><strong>${e(values.name)}</strong>${values.players.map((p) => e(p.name) + " / " + e(p.faction)).join(" versus ")}</div><div class="form-grid">${field("Attacks per turn", input("attacks_per_turn", values.settings.attacks_per_turn, 'type="number" min="1" max="20" required'))}${field("Domination threshold (%)", input("domination_threshold", values.settings.domination_threshold, 'type="number" min="1" max="100" required'))}</div>${field("Starting deployment", `<select name="deployment_mode"><option value="fronts">Established fronts · 5 / 4 territories</option><option value="headquarters">Headquarters only · 10 neutral territories</option></select>`)}<div class="field-group">${[
                ["resources_enabled", "Campaign resources"],
                ["random_events_enabled", "Narrative planetary events"],
              ]
                .map(
                  ([k, v]) =>
                    `<label class="check-label"><input name="${k}" type="checkbox" checked>${v}</label>`,
                )
                .join(
                  "",
                )}</div><p class="help-text">Established fronts start with five territories for the first commander, four for the second and three neutral. Headquarters-only starts with one each. Adjust individual territories in the editor before your first game. No historical battles are added. Tabletop house rules start disabled. A Final Assault unlocks at the domination threshold.</p>`
      }<div class="form-actions">${step > 1 ? '<button type="button" class="btn btn-ghost" id="setup-back">Go back</button>' : ""}<button class="btn btn-primary">${step === 3 ? "Begin campaign" : "Continue " + "→"}</button></div></form>`,
      { wide: step === 2 },
    );
    document.querySelector("#setup-back")?.addEventListener("click", () => {
      step--;
      draw();
    });
    document.querySelector("#setup-form").onsubmit = async (ev) => {
      ev.preventDefault();
      const d = new FormData(ev.target);
      if (step === 1) {
        values.name = d.get("name");
        step++;
        draw();
      } else if (step === 2) {
        values.players = values.players.map((p, i) => ({
          ...p,
          name: d.get(`name${i}`),
          faction: d.get(`faction${i}`),
          color: d.get(`color${i}`),
        }));
        step++;
        draw();
      } else {
        values.settings.attacks_per_turn = Number(d.get("attacks_per_turn"));
        values.settings.domination_threshold = Number(
          d.get("domination_threshold"),
        );
        ["resources_enabled", "random_events_enabled"].forEach(
          (k) => (values.settings[k] = d.has(k)),
        );
        const btn = ev.target.querySelector("[type=submit],button:last-child");
        btn.disabled = true;
        try {
          await ctx.store.createCampaign({
            ...values,
            seed_demo: false,
            neutral_start: d.get("deployment_mode") === "headquarters",
          });
          closeModal();
          location.hash = "christopia";
          ctx.render();
          toast("THE WAR FOR CHRISTOPIA HAS BEGUN");
        } catch (error) {
          toast(error.message, "error");
          btn.disabled = false;
        }
      }
    };
  };
  draw();
}
