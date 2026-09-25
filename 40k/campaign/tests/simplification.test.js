import test from "node:test";
import assert from "node:assert/strict";
import { createDemoState, createEmptyState } from "../js/seed.js";
import { simplifyCampaignContent } from "../js/content-update.js";
import { applyCommand } from "../js/engine.js";

test("new campaigns resolve every fixed scenario after template ids change", () => {
  for (const state of [createDemoState(), createEmptyState("Fresh campaign")]) {
    assert.equal(state.units.length, 0);
    assert.equal(state.settings.unit_tracking_enabled, false);
    for (const territory of state.territories)
      assert.ok(state.scenarios.some((s) => s.id === territory.scenario_id));
  }
});

test("battle input cannot override the territory's assigned mission or objectives", () => {
  const state = createDemoState();
  const territory = state.territories.find((t) => t.name === "The Ash Wastes");
  const scenario = state.scenarios.find((s) => s.id === territory.scenario_id);
  const next = applyCommand(state, {
    type: "create_battle",
    payload: {
      territory_id: territory.id,
      attacker_id: state.players[0].id,
      mission: "Destroy the asset",
      deployment: "Override",
      modifier: "Override",
      attacker_objective: "Override",
      defender_objective: "Override",
      asset_side: "attacker",
    },
  });
  const battle = next.battles.at(-1);
  assert.equal(battle.mission, scenario.mission);
  assert.equal(battle.deployment, scenario.deployment);
  assert.equal(battle.modifier, scenario.condition);
  assert.equal(battle.attacker_objective, scenario.attacker_objective);
  assert.equal(battle.defender_objective, scenario.defender_objective);
  assert.equal(battle.asset_side, null);
});

test("migration retains earned resources, history and archived unit records", () => {
  const original = createDemoState();
  original.territories.forEach((t) => delete t.scenario_id);
  original.units.push({ id: "archived-unit", name: "A remembered hero" });
  original.actions[0].description = "Old rule";
  const before = structuredClone(original);
  const migrated = simplifyCampaignContent(original);
  assert.deepEqual(original, before);
  for (const key of ["players", "battles", "history", "transactions", "units"])
    assert.deepEqual(migrated[key], original[key]);
  assert.ok(migrated.actions.every((a) => a.description === "to decide"));
  assert.ok(
    migrated.territories.every((t) =>
      migrated.scenarios.some((s) => s.id === t.scenario_id),
    ),
  );
});

test("undecided boosts cannot spend a player's accumulated resources", () => {
  const state = createDemoState();
  const before = structuredClone(state);
  for (const action of state.actions) {
    assert.throws(
      () =>
        applyCommand(state, {
          type: "spend_resource",
          payload: {
            player_id: state.players[0].id,
            action_id: action.id,
          },
        }),
      /to decide/,
    );
  }
  assert.deepEqual(state, before);
});
