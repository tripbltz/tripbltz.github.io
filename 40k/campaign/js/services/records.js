import {
  assert,
  find,
  text,
  integer,
  coordinate,
  boolean,
  oneOf,
  colour,
  imageUrl,
  date,
  now,
  admin,
  owns,
  participant,
  activeCampaign,
  recordId,
  upsert,
  history,
  transferTerritory,
  isUuid,
} from "./common.js";

export function saveTerritory(state, payload, actor) {
  admin(actor);
  activeCampaign(state);
  const input = payload.territory;
  assert(input && typeof input === "object", "Enter the territory details.");
  const { id, existing } = recordId(state, "territories", input);
  const value = {
    name: "",
    description: "",
    x: 50,
    y: 50,
    type: "Strategic location",
    strategic_value: 1,
    owner_id: null,
    previous_owner_id: null,
    contested: false,
    bonus_key: "none",
    capture_count: 0,
    fortified: false,
    headquarters_for: null,
    image_url: "",
    ...existing,
    ...input,
    id,
  };
  const scenarioId = value.scenario_id || state.scenarios[0]?.id;
  find(state, "scenarios", scenarioId, "territory scenario");
  const owner = value.owner_id || null;
  if (owner) find(state, "players", owner);
  if (value.headquarters_for) {
    find(state, "players", value.headquarters_for);
    assert(
      !state.territories.some(
        (t) => t.id !== id && t.headquarters_for === value.headquarters_for,
      ),
      "This player already has a Planetary Headquarters. Remove the previous designation first.",
    );
  }
  const pending = state.battles.some(
    (b) => b.territory_id === id && b.status !== "completed",
  );
  assert(
    !pending || owner === existing.owner_id,
    "Complete the ongoing battle before changing ownership of this territory.",
  );
  const territory = {
    id,
    name: text(value.name, "Territory name", { required: true, max: 200 }),
    description: text(value.description, "Description"),
    x: coordinate(value.x, "Horizontal position"),
    y: coordinate(value.y, "Vertical position"),
    type: text(value.type, "Territory type", { required: true, max: 100 }),
    strategic_value: integer(value.strategic_value, "Strategic value", 1, 10),
    owner_id: existing?.owner_id || null,
    previous_owner_id: existing?.previous_owner_id || null,
    contested: pending || boolean(value.contested, "Contested status"),
    bonus_key: oneOf(
      value.bonus_key,
      ["none", "resource", "spaceport", "defence", "domination"],
      "Campaign bonus",
    ),
    capture_count: existing?.capture_count || 0,
    fortified: boolean(value.fortified, "Fortified status"),
    headquarters_for: value.headquarters_for || null,
    scenario_id: scenarioId,
    image_url: imageUrl(value.image_url),
  };
  if (existing)
    transferTerritory(
      state,
      territory,
      owner,
      null,
      `${territory.name}: control updated by campaign command`,
    );
  else territory.owner_id = owner;
  upsert(state, "territories", territory);
  if (payload.neighbours !== undefined) {
    assert(
      Array.isArray(payload.neighbours),
      "Choose the neighbouring territories.",
    );
    const neighbours = [...new Set(payload.neighbours)];
    for (const neighbour of neighbours) {
      assert(neighbour !== id, "A territory cannot be adjacent to itself.");
      find(state, "territories", neighbour);
    }
    state.connections = state.connections.filter(
      (c) => c.territory_a !== id && c.territory_b !== id,
    );
    state.connections.push(
      ...neighbours.map((other) => ({ territory_a: id, territory_b: other })),
    );
  }
  return true;
}

export function saveSettings(state, payload, actor) {
  admin(actor);
  activeCampaign(state);
  assert(
    payload.settings && typeof payload.settings === "object",
    "Enter the campaign settings.",
  );
  const result = { ...state.settings };
  for (const key of [
    "resources_enabled",
    "random_events_enabled",
    "unit_tracking_enabled",
    "gameplay_modifiers_enabled",
    "final_assault_enabled",
  ]) {
    if (payload.settings[key] !== undefined)
      result[key] = boolean(payload.settings[key], key.replaceAll("_", " "));
  }
  for (const [key, min, max] of [
    ["attacks_per_turn", 1, 20],
    ["domination_threshold", 1, 100],
    ["final_assault_penalty", 0, 50],
  ]) {
    if (payload.settings[key] !== undefined)
      result[key] = integer(
        payload.settings[key],
        key.replaceAll("_", " "),
        min,
        max,
      );
  }
  state.settings = result;
  return true;
}

export function savePlayer(state, payload, actor) {
  admin(actor);
  activeCampaign(state);
  const input = payload.player;
  assert(input && typeof input === "object", "Enter the player details.");
  const { id, existing } = recordId(state, "players", input);
  const value = {
    name: "",
    color: "#76b3cf",
    role: "player",
    profile_id: null,
    resources: 0,
    ...existing,
    ...input,
  };
  const role = oneOf(value.role, ["admin", "player"], "Player role");
  if (existing?.role === "admin" && role !== "admin")
    assert(
      state.players.some((p) => p.id !== id && p.role === "admin"),
      "The campaign must retain at least one administrator.",
    );
  assert(
    !value.profile_id || isUuid(value.profile_id),
    "The linked authentication profile must be a UUID.",
  );
  assert(
    !value.profile_id ||
      !state.players.some(
        (p) => p.id !== id && p.profile_id === value.profile_id,
      ),
    "This account is already linked to another campaign player.",
  );
  const player = {
    id,
    name: text(value.name, "Player name", { required: true, max: 100 }),
    color: colour(value.color),
    role,
    profile_id: value.profile_id || null,
    resources: integer(value.resources, "Campaign resources", 0, 100000),
  };
  upsert(state, "players", player);
  if (!existing)
    history(state, {
      title: `${player.name} joined the campaign`,
      description: "A new commander has entered the war for Christopia.",
    });
  return true;
}

export function saveFaction(state, payload, actor) {
  const input = payload.faction;
  assert(input && typeof input === "object", "Enter the faction details.");
  const { id, existing } = recordId(state, "factions", input);
  if (existing) owns(actor, existing.player_id);
  const value = {
    name: "",
    player_id: actor.player_id,
    color: "#76b3cf",
    description: "",
    image_url: "",
    ...existing,
    ...input,
  };
  const player = find(state, "players", value.player_id);
  owns(actor, player.id);
  const faction = {
    id,
    name: text(value.name, "Faction name", { required: true, max: 200 }),
    player_id: player.id,
    color: colour(value.color),
    description: text(value.description, "Description"),
    image_url: imageUrl(value.image_url),
  };
  upsert(state, "factions", faction);
  if (!existing)
    history(state, {
      title: `${faction.name} joined the campaign`,
      description: `${player.name} has committed ${faction.name} to the war for Christopia.`,
    });
  return true;
}

export function saveUnit(state, payload, actor) {
  const input = payload.unit;
  assert(input && typeof input === "object", "Enter the unit details.");
  const { id, existing } = recordId(state, "units", input);
  if (existing)
    owns(actor, find(state, "factions", existing.faction_id).player_id);
  const value = {
    name: "",
    nickname: "",
    battles: 0,
    victories: 0,
    kills: 0,
    times_destroyed: 0,
    honours: "",
    notes: "",
    ...existing,
    ...input,
  };
  owns(actor, find(state, "factions", value.faction_id).player_id);
  const unit = {
    id,
    faction_id: value.faction_id,
    name: text(value.name, "Unit name", { required: true, max: 200 }),
    nickname: text(value.nickname, "Nickname", { max: 200 }),
    notes: text(value.notes, "Notes"),
    honours: text(
      Array.isArray(value.honours) ? value.honours.join("; ") : value.honours,
      "Honours",
    ),
  };
  for (const key of ["battles", "victories", "kills", "times_destroyed"])
    unit[key] = integer(value[key], key.replaceAll("_", " "));
  assert(
    unit.victories <= unit.battles,
    "Unit victories cannot exceed battles fought.",
  );
  upsert(state, "units", unit);
  return true;
}

export function saveScenario(state, payload, actor) {
  admin(actor);
  const input = payload.scenario;
  assert(input && typeof input === "object", "Enter the scenario details.");
  const { id, existing } = recordId(state, "scenarios", input);
  const value = { ...existing, ...input };
  const scenario = { id };
  for (const key of [
    "title",
    "mission",
    "deployment",
    "condition",
    "narrative",
    "attacker_objective",
    "defender_objective",
  ])
    scenario[key] = text(value[key], key.replaceAll("_", " "), {
      required: ["title", "mission"].includes(key),
    });
  upsert(state, "scenarios", scenario);
  return true;
}

export function saveEvent(state, payload, actor) {
  admin(actor);
  const input = payload.event;
  assert(
    input && typeof input === "object",
    "Enter the planetary event details.",
  );
  const { id, existing } = recordId(state, "events", input);
  const value = {
    title: "",
    description: "",
    effect: "",
    duration: 1,
    remaining_turns: 0,
    active: false,
    ...existing,
    ...input,
  };
  const duration = integer(value.duration, "Duration", 1, 99);
  const active = boolean(value.active, "Active state");
  const event = {
    id,
    title: text(value.title, "Event title", { required: true, max: 200 }),
    description: text(value.description, "Description"),
    effect: text(value.effect, "Optional gameplay effect"),
    duration,
    active,
    remaining_turns: active
      ? Math.min(
          duration,
          Math.max(
            1,
            integer(
              value.remaining_turns || duration,
              "Remaining turns",
              0,
              99,
            ),
          ),
        )
      : 0,
  };
  upsert(state, "events", event);
  return true;
}

export function saveAction(state, payload, actor) {
  admin(actor);
  const input = payload.action;
  assert(
    input && typeof input === "object",
    "Enter the resource action details.",
  );
  const { id, existing } = recordId(state, "actions", input);
  const value = { ...existing, ...input };
  const action = {
    id,
    key: oneOf(
      value.key,
      ["recon", "fortify", "redeploy", "counter"],
      "Action type",
    ),
    name: text(value.name, "Action name", { required: true, max: 100 }),
    description: text(value.description, "Description"),
    cost: integer(value.cost, "Resource cost", 0, 1000),
  };
  upsert(state, "actions", action);
  return true;
}

export function saveChronicle(state, payload, actor) {
  const entry = find(state, "chronicle", payload.id, "Chronicle entry");
  participant(actor, find(state, "battles", entry.battle_id));
  entry.narrative = text(payload.narrative, "Narrative", {
    required: true,
    max: 50000,
  });
  return true;
}

export function addPhoto(state, payload, actor) {
  const input = payload.photo;
  assert(input && typeof input === "object", "Choose a battle photograph.");
  const battle = find(state, "battles", input.battle_id);
  participant(actor, battle);
  const { id, existing } = recordId(state, "photos", input);
  assert(!existing, "This photograph is already attached to the battle.");
  assert(
    input.storage_path || input.url,
    "The photograph did not upload. Please select the image and try again.",
  );
  const photo = {
    id,
    battle_id: battle.id,
    storage_path: text(input.storage_path, "Image storage path", { max: 1000 }),
    url: imageUrl(input.url),
    caption: text(input.caption, "Caption", { max: 2000 }),
    created_at: input.created_at ? date(input.created_at, "Photo date") : now(),
  };
  if (photo.storage_path)
    assert(
      !photo.storage_path.split("/").includes(".."),
      "The image storage path is invalid.",
    );
  state.photos.push(photo);
  return true;
}

export function removePhoto(state, payload, actor) {
  const photo = find(state, "photos", payload.id, "photograph");
  participant(actor, find(state, "battles", photo.battle_id));
  state.photos = state.photos.filter((p) => p.id !== photo.id);
  return true;
}

export function archiveCampaign(state, payload, actor) {
  admin(actor);
  if (state.campaign.status === "archived") return false;
  state.campaign.status = "archived";
  history(state, {
    title: "Campaign archived",
    description:
      "The campaign has been sealed in the Imperial archives. Every battle, photograph and Chronicle entry is preserved.",
  });
  return true;
}
