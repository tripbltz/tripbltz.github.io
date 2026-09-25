import test from "node:test";
import assert from "node:assert/strict";
import { createDemoState, createEmptyState } from "../js/seed.js";
import {
  applyCommand,
  canAttack,
  getLegalTargets,
  getStats,
  resultConsequences,
  finalAssaultUnlocked,
  generateScenario,
} from "../js/engine.js";

const command = (state, type, payload = {}, actor) =>
  applyCommand(state, { type, payload }, actor);
function fixture() {
  const state = createDemoState();
  // Archived records and previously configured effects remain supported.
  state.actions.forEach((a) => (a.description = "Configured legacy effect"));
  state.units = [0, 0, 1].map((f, i) => ({
    id: crypto.randomUUID(),
    name: `Legacy unit ${i}`,
    faction_id: state.factions[f].id,
    battles: 0,
    victories: 0,
    kills: 0,
    times_destroyed: 0,
    honours: "",
    notes: "",
    nickname: "",
  }));
  state.battles = state.battles.filter(
    (battle) => battle.status === "completed",
  );
  state.territories.forEach((territory) => {
    territory.contested = false;
  });
  state.settings.random_events_enabled = false;
  return state;
}
function context(state) {
  return {
    chris: state.players[0],
    other: state.players[1],
    playerActor: { player_id: state.players[1].id, role: "player" },
    adminActor: { player_id: state.players[0].id, role: "admin" },
  };
}
function battleInput(state, overrides = {}) {
  const { chris, other } = context(state);
  return {
    territory_id: state.territories[1].id,
    attacker_id: other.id,
    defender_id: chris.id,
    points: 1000,
    status: "active",
    ...overrides,
  };
}
function newBattle(state, overrides = {}, actor) {
  return command(state, "create_battle", battleInput(state, overrides), actor);
}
function complete(state, result = "attacker", options = {}, actor) {
  return command(
    state,
    "complete_battle",
    {
      id: state.battles.at(-1).id,
      result,
      attacker_score: 61,
      defender_score: 59,
      ...options,
    },
    actor,
  );
}
function finalFixture() {
  const state = fixture();
  state.territories.forEach((territory, index) => {
    territory.owner_id = index < 9 ? state.players[0].id : state.players[1].id;
    territory.contested = false;
  });
  return state;
}

test("demo is coherent: twelve territories, five historical battles, one contested active engagement", () => {
  const state = createDemoState();
  assert.equal(state.territories.length, 12);
  assert.equal(state.battles.filter((b) => b.status === "completed").length, 5);
  assert.equal(state.battles.filter((b) => b.status === "active").length, 1);
  assert.equal(state.chronicle.length, 5);
  assert.deepEqual(
    getStats(state).players.map((p) => p.territories),
    [5, 4],
  );
  assert.equal(getStats(state).neutral, 3);
  assert.equal(getStats(state).contested, 1);
  assert.equal(state.territories.find((t) => t.contested).name, "Fort Rouse");
});

test("new campaigns have independent UUIDs and no historical results", () => {
  const first = createEmptyState("Campaign I");
  const second = createEmptyState("Campaign II");
  assert.notEqual(first.campaign.id, second.campaign.id);
  assert.notEqual(first.territories[0].id, second.territories[0].id);
  assert.notEqual(first.players[0].id, second.players[0].id);
  assert.equal(first.battles.length, 0);
  assert.equal(first.campaign.turn, 1);
  assert(
    first.connections.every(
      (link) =>
        first.territories.some((t) => t.id === link.territory_a) &&
        first.territories.some((t) => t.id === link.territory_b),
    ),
  );
});

test("normal attacks require adjacency; own and contested territories cannot be attacked", () => {
  const state = fixture();
  const { chris } = context(state);
  assert.equal(
    canAttack(state, chris.id, state.territories[9].id).allowed,
    true,
  );
  assert.match(
    canAttack(state, chris.id, state.territories[8].id).reason,
    /not adjacent/,
  );
  assert.equal(
    canAttack(state, chris.id, state.territories[0].id).allowed,
    false,
  );
  state.territories[9].contested = true;
  assert.equal(
    canAttack(state, chris.id, state.territories[9].id).allowed,
    false,
  );
  assert(!getLegalTargets(state, chris.id).includes(state.territories[9].id));
});

test("spaceport grants global reach and illegal creation leaves the original state unchanged", () => {
  const state = fixture();
  const { chris, other } = context(state);
  assert.equal(
    canAttack(state, other.id, state.territories[6].id).allowed,
    true,
  );
  const before = structuredClone(state);
  assert.throws(
    () =>
      newBattle(state, {
        attacker_id: chris.id,
        defender_id: other.id,
        territory_id: state.territories[8].id,
      }),
    /not adjacent/,
  );
  assert.deepEqual(state, before);
});

test("capture, resources, history and Chronicle commit once with an immutable original", () => {
  const before = fixture();
  const planned = newBattle(before);
  const original = structuredClone(planned);
  const result = complete(planned);
  const battle = result.battles.at(-1);
  const territory = result.territories.find(
    (t) => t.id === battle.territory_id,
  );
  assert.equal(territory.owner_id, result.players[1].id);
  assert.equal(territory.previous_owner_id, result.players[0].id);
  assert.equal(territory.contested, false);
  assert.equal(territory.capture_count, 1);
  assert.equal(result.players[1].resources, before.players[1].resources + 2);
  assert.equal(result.chronicle.length, before.chronicle.length + 1);
  assert.equal(result.transactions.length, before.transactions.length + 1);
  assert.equal(result.campaign.revision, planned.campaign.revision + 1);
  assert.deepEqual(planned, original);
  assert.deepEqual(complete(result), result);
  assert.throws(() => complete(result, "defender"), /already completed/);
});

test("defender victory retains ownership; draws leave neutral territory unclaimed and earn no resource", () => {
  const state = fixture();
  const defended = complete(newBattle(state), "defender");
  assert.equal(defended.territories[1].owner_id, state.players[0].id);
  assert.equal(
    defended.territories[1].capture_count,
    state.territories[1].capture_count,
  );
  assert.equal(defended.players[0].resources, state.players[0].resources + 2);
  const drawn = complete(
    newBattle(state, { territory_id: state.territories[2].id }),
    "draw",
  );
  assert.equal(drawn.territories[2].owner_id, null);
  assert.equal(drawn.battles.at(-1).winner_id, null);
  assert.equal(drawn.transactions.length, state.transactions.length);
});

test("result confirmation accurately previews capture and configured earned resources", () => {
  const state = newBattle(fixture());
  const preview = resultConsequences(state, state.battles.at(-1).id, {
    result: "attacker",
    resources_earned: 4,
  });
  assert.equal(preview.territory_from, state.players[0].id);
  assert.equal(preview.territory_to, state.players[1].id);
  assert.equal(preview.resources, 4);
  assert.match(preview.text, /Fort Rouse/);
  assert.match(preview.text, /3 domination points/);
  assert.equal(preview.campaign_ends, false);
});

test("statistics count real results and territory percentage independently of strategic value", () => {
  const state = createDemoState();
  const stats = getStats(state);
  assert.equal(stats.total_battles, 5);
  assert.equal(stats.players[0].wins, 3);
  assert.equal(stats.players[0].losses, 2);
  assert.equal(stats.players[0].domination, (5 / 12) * 100);
  assert.equal(stats.players[0].domination_points, 13);
  assert.equal(stats.largest_victory.margin, 26);
  assert.equal(stats.closest_battle.margin, 2);
  assert.equal(stats.most_contested.name, "Fort Rouse");
  assert.equal(stats.most_successful_faction.name, "Astra Militarum");
});

test("turn attack limit includes planned and completed attacks; counter-offensive adds one", () => {
  let state = fixture();
  state.settings.attacks_per_turn = 1;
  state = complete(newBattle(state));
  const other = state.players[1];
  assert.match(
    canAttack(state, other.id, state.territories[0].id).reason,
    /all attacks/,
  );
  state = command(state, "spend_resource", {
    player_id: other.id,
    action_id: state.actions.find((a) => a.key === "counter").id,
  });
  assert.equal(
    canAttack(state, other.id, state.territories[0].id).allowed,
    true,
  );
  state = newBattle(state, { territory_id: state.territories[0].id });
  assert.equal(
    canAttack(state, other.id, state.territories[3].id).allowed,
    false,
  );
});

test("redeployment consumes one nonadjacency token, without consuming it on normal attacks", () => {
  let state = fixture();
  const { chris, other } = context(state);
  state = command(state, "spend_resource", {
    player_id: chris.id,
    action_id: state.actions.find((a) => a.key === "redeploy").id,
  });
  assert.equal(
    canAttack(state, chris.id, state.territories[8].id).allowed,
    true,
  );
  state = newBattle(state, {
    attacker_id: chris.id,
    defender_id: other.id,
    territory_id: state.territories[9].id,
  });
  assert.equal(state.transactions.at(-1).consumed, false);
  state = newBattle(state, {
    attacker_id: chris.id,
    defender_id: other.id,
    territory_id: state.territories[8].id,
  });
  assert.equal(state.transactions.at(-1).consumed, true);
});

test("fortify requires owned uncontested location and is cleared when attacked", () => {
  let state = fixture();
  const { chris } = context(state);
  const action_id = state.actions.find((a) => a.key === "fortify").id;
  assert.throws(
    () =>
      command(state, "spend_resource", {
        player_id: chris.id,
        action_id,
        territory_id: state.territories[4].id,
      }),
    /you control/,
  );
  state = command(state, "spend_resource", {
    player_id: chris.id,
    action_id,
    territory_id: state.territories[1].id,
  });
  assert.equal(state.territories[1].fortified, true);
  assert.throws(
    () =>
      command(state, "spend_resource", {
        player_id: chris.id,
        action_id,
        territory_id: state.territories[1].id,
      }),
    /already fortified/,
  );
  state = newBattle(state);
  assert.equal(state.territories[1].fortified, false);
  assert.match(state.battles.at(-1).modifier, /narrative only/);
});

test("recon stores two editable scenario choices and spending cannot overdraw", () => {
  let state = fixture();
  const { chris } = context(state);
  const action_id = state.actions.find((a) => a.key === "recon").id;
  state = command(state, "spend_resource", { player_id: chris.id, action_id });
  assert.equal(state.transactions.at(-1).scenario_options.length, 2);
  assert.notEqual(
    state.transactions.at(-1).scenario_options[0].id,
    state.transactions.at(-1).scenario_options[1].id,
  );
  state.players[0].resources = 0;
  const before = structuredClone(state);
  assert.throws(
    () => command(state, "spend_resource", { player_id: chris.id, action_id }),
    /currently has 0/,
  );
  assert.deepEqual(state, before);
});

test("advance turn awards location income, expires events and restores attacks", () => {
  const initial = fixture();
  const state = command(initial, "advance_turn");
  assert.equal(state.campaign.turn, 8);
  assert.equal(state.players[0].resources, initial.players[0].resources + 1);
  assert.equal(state.players[1].resources, initial.players[1].resources + 1);
  assert.equal(state.events[1].active, false);
  assert.equal(state.events[1].remaining_turns, 0);
  assert.throws(
    () => command(newBattle(initial), "advance_turn"),
    /Complete the planned and active battles/,
  );
});

test("disabled resource and event options leave resources and events inactive on next turn", () => {
  const initial = fixture();
  initial.settings.resources_enabled = false;
  const state = command(initial, "advance_turn");
  assert.deepEqual(
    state.players.map((p) => p.resources),
    initial.players.map((p) => p.resources),
  );
  assert.equal(
    state.events.some((e) => e.active),
    false,
  );
  assert.throws(
    () =>
      command(initial, "spend_resource", {
        player_id: initial.players[0].id,
        action_id: initial.actions[0].id,
      }),
    /disabled/,
  );
  assert.equal(complete(newBattle(initial)).battles.at(-1).resources_earned, 0);
});

test("threshold unlocks Final Assault without ending campaign; final win preserves complete history", () => {
  let state = finalFixture();
  const { chris, other } = context(state);
  assert.equal(finalAssaultUnlocked(state, chris.id), true);
  assert.equal(state.campaign.status, "active");
  assert.equal(
    canAttack(state, chris.id, state.territories[11].id, { finalAssault: true })
      .allowed,
    true,
  );
  assert.equal(
    canAttack(state, chris.id, state.territories[10].id, { finalAssault: true })
      .allowed,
    false,
  );
  state = newBattle(state, {
    attacker_id: chris.id,
    defender_id: other.id,
    territory_id: state.territories[11].id,
    is_final_assault: true,
  });
  const preview = resultConsequences(
    state,
    state.battles.at(-1).id,
    "attacker",
  );
  assert.equal(preview.campaign_ends, true);
  state = complete(state);
  assert.equal(state.campaign.status, "completed");
  assert.equal(state.campaign.winner_id, chris.id);
  assert(state.campaign.ended_at);
  assert.equal(state.battles.length, 6);
  assert.equal(state.chronicle.length, 6);
  assert.equal(getStats(state).players[0].territories, 10);
  assert.deepEqual(complete(state), state);
  assert.throws(() => command(state, "advance_turn"), /ended/);
  const archived = command(state, "archive_campaign");
  assert.equal(archived.campaign.status, "archived");
  assert.equal(archived.campaign.winner_id, chris.id);
  assert.equal(archived.battles.length, state.battles.length);
});

test("final assault threshold and enabled setting cannot be bypassed", () => {
  const low = fixture();
  const { chris, other } = context(low);
  assert.throws(
    () =>
      newBattle(low, {
        attacker_id: chris.id,
        defender_id: other.id,
        territory_id: low.territories[11].id,
        is_final_assault: true,
      }),
    /70%/,
  );
  const disabled = finalFixture();
  disabled.settings.final_assault_enabled = false;
  assert.equal(
    canAttack(disabled, chris.id, disabled.territories[11].id, {
      finalAssault: true,
    }).allowed,
    false,
  );
});

test("failed final assault relinquishes exactly the configured territories atomically", () => {
  const initial = finalFixture();
  const { chris, other } = context(initial);
  let state = newBattle(initial, {
    attacker_id: chris.id,
    defender_id: other.id,
    territory_id: initial.territories[11].id,
    is_final_assault: true,
  });
  const chosen = state.territories.slice(0, 3).map((t) => t.id);
  const before = structuredClone(state);
  assert.throws(
    () =>
      complete(state, "defender", { penalty_territory_ids: chosen.slice(1) }),
    /exactly 3/,
  );
  assert.deepEqual(state, before);
  state = complete(state, "defender", { penalty_territory_ids: chosen });
  assert.equal(state.campaign.status, "active");
  assert.equal(getStats(state).players[0].territories, 6);
  assert(
    chosen.every(
      (id) => state.territories.find((t) => t.id === id).owner_id === null,
    ),
  );
  assert.equal(state.territories[11].owner_id, other.id);
  assert.equal(
    state.history.filter((h) => h.title.includes("abandoned after")).length,
    3,
  );
  assert.deepEqual(complete(state, "defender"), state);
});

test("crossing threshold adds one unlock history entry", () => {
  let state = finalFixture();
  state.territories[8].owner_id = state.players[1].id;
  const { chris, other } = context(state);
  assert.equal(finalAssaultUnlocked(state, chris.id), false);
  state = newBattle(state, {
    attacker_id: chris.id,
    defender_id: other.id,
    territory_id: state.territories[8].id,
  });
  assert.equal(
    resultConsequences(state, state.battles.at(-1).id, "attacker")
      .final_assault_unlocked,
    true,
  );
  state = complete(state);
  assert.equal(state.campaign.status, "active");
  assert.equal(
    state.history.filter((h) => h.title === "THE FINAL ASSAULT UNLOCKED")
      .length,
    1,
  );
});

test("player permission guards protect admin commands, other armies and identity escalation", () => {
  const state = fixture();
  const { other, playerActor } = context(state);
  for (const type of [
    "save_settings",
    "save_territory",
    "save_player",
    "save_scenario",
    "save_event",
    "activate_event",
    "archive_campaign",
    "advance_turn",
    "save_action",
  ]) {
    assert.throws(() => command(state, type, {}, playerActor), /administrator/);
  }
  assert.throws(
    () =>
      command(
        state,
        "save_faction",
        { faction: { ...state.factions[0], description: "Hacked" } },
        playerActor,
      ),
    /own army/,
  );
  assert.throws(
    () =>
      command(
        state,
        "save_unit",
        { unit: { ...state.units[0], name: "Hacked" } },
        playerActor,
      ),
    /own army/,
  );
  assert.throws(
    () =>
      command(
        state,
        "save_settings",
        { settings: { attacks_per_turn: 5 } },
        { player_id: other.id, role: "admin" },
      ),
    /Administrator permission/,
  );
  assert.throws(
    () =>
      command(
        state,
        "advance_turn",
        {},
        { player_id: crypto.randomUUID(), role: "admin" },
      ),
    /not a player/,
  );
  assert.throws(
    () =>
      newBattle(
        state,
        {
          attacker_id: state.players[0].id,
          defender_id: other.id,
          territory_id: state.territories[9].id,
        },
        playerActor,
      ),
    /own army/,
  );
});

test("players may create their attacks, complete participated battles and edit their own units", () => {
  let state = fixture();
  const { playerActor } = context(state);
  state = newBattle(state, {}, playerActor);
  state = complete(state, "attacker", {}, playerActor);
  assert.equal(state.battles.at(-1).status, "completed");
  state = command(
    state,
    "save_unit",
    { unit: { ...state.units[2], nickname: "Da Best Mob" } },
    playerActor,
  );
  assert.equal(state.units[2].nickname, "Da Best Mob");
});

test("nonparticipant cannot change a battle, Chronicle or photographs", () => {
  let state = newBattle(fixture());
  const third = {
    id: crypto.randomUUID(),
    name: "Outsider",
    role: "player",
    color: "#ffffff",
    resources: 0,
    profile_id: null,
  };
  state.players.push(third);
  const actor = { player_id: third.id, role: "player" };
  assert.throws(
    () => complete(state, "attacker", {}, actor),
    /Only the players/,
  );
  assert.throws(
    () =>
      command(state, "start_battle", { id: state.battles.at(-1).id }, actor),
    /Only the players/,
  );
  assert.throws(
    () =>
      command(
        state,
        "add_photo",
        {
          photo: {
            battle_id: state.battles[0].id,
            url: "https://example.com/photo.jpg",
          },
        },
        actor,
      ),
    /Only the players/,
  );
  assert.throws(
    () =>
      command(
        state,
        "save_chronicle",
        { id: state.chronicle[0].id, narrative: "Changed" },
        actor,
      ),
    /Only the players/,
  );
});

test("invalid field values, factions and unfinished ownership edits are rejected without partial writes", () => {
  const state = fixture();
  assert.throws(() => newBattle(state, { points: -100 }), /Points/);
  assert.throws(
    () => newBattle(state, { attacker_faction_id: state.factions[0].id }),
    /faction belonging/,
  );
  assert.throws(() => newBattle(state, { date: "2026-02-30" }), /valid date/);
  assert.throws(
    () =>
      command(state, "save_territory", {
        territory: { ...state.territories[0], x: -1 },
      }),
    /between 0 and 100/,
  );
  assert.throws(
    () =>
      command(state, "save_settings", {
        settings: { domination_threshold: 101 },
      }),
    /between 1 and 100/,
  );
  assert.throws(
    () =>
      command(state, "save_settings", {
        settings: { resources_enabled: "false" },
      }),
    /on or off/,
  );
  const ongoing = newBattle(state);
  assert.throws(
    () =>
      command(ongoing, "save_territory", {
        territory: {
          ...ongoing.territories[1],
          owner_id: ongoing.players[1].id,
        },
      }),
    /ongoing battle/,
  );
  const before = structuredClone(ongoing);
  assert.throws(
    () => complete(ongoing, "attacker", { rounds: -1 }),
    /Battle rounds/,
  );
  assert.deepEqual(ongoing, before);
});

test("completed report editing never silently replays an outcome or mutates related history", () => {
  const state = fixture();
  const battle = state.battles[0];
  assert.throws(
    () =>
      command(state, "edit_battle", {
        battle: { id: battle.id, result: "defender" },
      }),
    /campaign history/,
  );
  assert.throws(
    () =>
      command(state, "edit_battle", {
        battle: { id: battle.id, territory_id: state.territories[2].id },
      }),
    /campaign history/,
  );
  const edited = command(state, "edit_battle", {
    battle: { id: battle.id, notes: "A glorious victory.", attacker_score: 73 },
  });
  assert.equal(edited.battles[0].notes, "A glorious victory.");
  assert.equal(edited.battles[0].attacker_score, 73);
  assert.deepEqual(edited.territories, state.territories);
  assert.deepEqual(edited.transactions, state.transactions);
});

test("photo upload failure is actionable and successful add/remove preserves ownership rules", () => {
  let state = fixture();
  const battle_id = state.battles[0].id;
  assert.throws(
    () => command(state, "add_photo", { photo: { battle_id } }),
    /did not upload/,
  );
  assert.throws(
    () =>
      command(state, "add_photo", {
        photo: { battle_id, url: "javascript:alert(1)" },
      }),
    /HTTP/,
  );
  state = command(state, "add_photo", {
    photo: {
      battle_id,
      url: "https://example.com/battle.jpg",
      caption: "The last stand",
    },
  });
  assert.equal(state.photos.length, 1);
  state = command(state, "remove_photo", { id: state.photos[0].id });
  assert.equal(state.photos.length, 0);
});

test("scenario generation remains usable with no stored components", () => {
  const state = fixture();
  const generated = generateScenario(state);
  assert(
    generated.mission && generated.narrative && generated.attacker_objective,
  );
  state.scenarios = [];
  assert.equal(generateScenario(state).mission, "Take and Hold");
});

test("archived campaign records are immutable through the command boundary", () => {
  const state = command(fixture(), "archive_campaign");
  for (const [type, payload] of [
    ["save_faction", { faction: state.factions[0] }],
    ["save_unit", { unit: state.units[0] }],
    ["save_scenario", { scenario: state.scenarios[0] }],
    ["save_event", { event: state.events[0] }],
    ["save_chronicle", { id: state.chronicle[0].id, narrative: "replacement" }],
    ["edit_battle", { battle: state.battles[0] }],
  ]) {
    assert.throws(() => command(state, type, payload), /archived/);
  }
});

test("headquarters are reserved for the final assault; spaceports cannot bypass endgame", () => {
  const state = fixture(),
    hq = state.territories.find(
      (t) => t.headquarters_for === state.players[0].id,
    );
  assert.equal(canAttack(state, state.players[1].id, hq.id).allowed, false);
  assert.match(
    canAttack(state, state.players[1].id, hq.id).reason,
    /Final Assault/,
  );
  state.settings.final_assault_enabled = false;
  assert.equal(canAttack(state, state.players[1].id, hq.id).allowed, true);
  const final = finalFixture(),
    enemy = final.territories.find(
      (t) => t.headquarters_for === final.players[1].id,
    );
  assert.ok(getLegalTargets(final, final.players[0].id).includes(enemy.id));
});

test("recent outcome correction reverses control and resources without duplicate Chronicle entries", () => {
  const initial = fixture(),
    played = complete(newBattle(initial));
  const battle = played.battles.at(-1),
    oldWinner = played.players[1],
    beforeOldResources = oldWinner.resources;
  const updated = command(played, "edit_battle", {
    battle: {
      ...battle,
      result: "defender",
      attacker_score: 40,
      defender_score: 70,
    },
  });
  const target = updated.territories.find((t) => t.id === battle.territory_id);
  assert.equal(target.owner_id, updated.players[0].id);
  assert.equal(
    target.capture_count,
    initial.territories.find((t) => t.id === target.id).capture_count,
  );
  assert.equal(
    updated.players[1].resources,
    beforeOldResources - battle.resources_earned,
  );
  assert.equal(
    updated.players[0].resources,
    initial.players[0].resources + battle.resources_earned,
  );
  assert.equal(
    updated.chronicle.filter((c) => c.battle_id === battle.id).length,
    1,
  );
  assert.ok(updated.history.some((h) => h.title === "Battle result corrected"));
  assert.equal(updated.battles.at(-1).winner_id, updated.players[0].id);
  assert.equal(played.battles.at(-1).result, "attacker");
});

test("correction is rejected after spending dependent rewards and leaves original unchanged", () => {
  const played = complete(newBattle(fixture()));
  const battle = played.battles.at(-1),
    action = played.actions.find((a) => a.key === "counter");
  const spent = command(played, "spend_resource", {
    player_id: battle.winner_id,
    action_id: action.id,
  });
  assert.throws(
    () =>
      command(spent, "edit_battle", {
        battle: { ...battle, result: "defender" },
      }),
    /resources have been spent/,
  );
  assert.equal(spent.battles.at(-1).result, "attacker");
});
