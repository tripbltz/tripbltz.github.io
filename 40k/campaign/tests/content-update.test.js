import test from "node:test";
import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import { createDemoState } from "../js/seed.js";
import { createStore } from "../js/store.js";
import { updateCampaignContent } from "../js/content-update.js";
import { applyCommand, generateScenario } from "../js/engine.js";
import {
  createDestroyAssetScenario,
  forcePoints,
} from "../js/services/scenarios.js";

function legacyState() {
  const state = createDemoState();
  state.units = [{ id: crypto.randomUUID(), honours: "Hive Ashstomp" }];
  const before = JSON.stringify(state)
    .replaceAll("Fort Rouse", "Fort Penelope")
    .replaceAll("Hive Ashstomp", "Hive Ward")
    .replaceAll("Sam's Smelly Hole", "The Hazel Expanse");
  const legacy = JSON.parse(before);
  legacy.scenarios = legacy.scenarios.filter(
    (sc) => sc.title !== "Destroy the asset",
  );
  return legacy;
}

test("content update preserves records, ownership and ids while renaming all references exactly once", () => {
  const legacy = legacyState(),
    original = structuredClone(legacy),
    updated = updateCampaignContent(legacy);
  assert.deepEqual(legacy, original);
  assert.ok(updated.changed);
  assert.equal(updated.state.campaign.revision, legacy.campaign.revision + 1);
  assert.deepEqual(
    updated.state.territories.map((t) => [t.id, t.owner_id]),
    legacy.territories.map((t) => [t.id, t.owner_id]),
  );
  assert.deepEqual(
    updated.state.battles.map((b) => [b.id, b.result, b.attacker_score]),
    legacy.battles.map((b) => [b.id, b.result, b.attacker_score]),
  );
  assert.ok(
    updated.state.territories.some((t) => t.name === "Sam's Smelly Hole"),
  );
  assert.ok(
    updated.state.battles.some((b) => b.name === "Return to Fort Rouse"),
  );
  assert.ok(
    updated.state.units.some((u) => u.honours.includes("Hive Ashstomp")),
  );
  assert.equal(
    updated.state.scenarios.filter((s) => s.title === "Destroy the asset")
      .length,
    1,
  );
  assert.equal(updateCampaignContent(updated.state).changed, false);
});

test("an existing browser campaign migrates persistently without resetting its history", async () => {
  globalThis.indexedDB = indexedDB;
  const legacy = legacyState();
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open("christopia-campaign-v1", 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("campaigns", { keyPath: "id" });
      r.result.createObjectStore("meta", { keyPath: "id" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction(["campaigns", "meta"], "readwrite");
    tx.objectStore("campaigns").put({ id: legacy.campaign.id, state: legacy });
    tx.objectStore("meta").put({ id: "selected", value: legacy.campaign.id });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  const store = await createStore();
  assert.equal(store.state.campaign.id, legacy.campaign.id);
  assert.equal(store.state.battles.length, legacy.battles.length);
  assert.ok(store.state.territories.some((t) => t.name === "Fort Rouse"));
  const territory = store.state.territories.find(
    (t) => t.name === "Fort Rouse",
  );
  await store.commit({
    type: "save_territory",
    payload: { territory: { ...territory, name: "Fort Penelope" } },
  });
  const reload = await createStore();
  assert.ok(
    reload.state.territories.some((t) => t.name === "Fort Penelope"),
    "later manual edits must not be overwritten",
  );
  assert.equal(
    reload.state.scenarios.filter((s) => s.title === "Destroy the asset")
      .length,
    1,
  );
});

test("Baneblade scenario keeps escape rules together and enforces asymmetric allowances for either player", () => {
  const scenario = createDestroyAssetScenario();
  assert.match(scenario.deployment, /after both armies deploy/);
  assert.match(scenario.narrative, /twice/);
  assert.match(scenario.defender_objective, /Escape/);
  assert.deepEqual(generateScenario({ scenarios: [scenario] }), scenario);
  for (const side of ["attacker", "defender", null]) {
    const state = createDemoState();
    state.battles = state.battles.filter((b) => b.status === "completed");
    state.territories.forEach((t) => (t.contested = false));
    const territory = state.territories.find((t) => t.name === "Fort Rouse");
    if (side)
      territory.scenario_id = state.scenarios.find(
        (sc) => sc.title === "Destroy the asset",
      ).id;
    const result = applyCommand(state, {
      type: "create_battle",
      payload: {
        ...scenario,
        name: scenario.title,
        attacker_id: state.players[1].id,
        defender_id: state.players[0].id,
        territory_id: territory.id,
        points: 1250,
        asset_side: side,
        attacker_points: 1,
        defender_points: 1,
      },
    });
    const b = result.battles.at(-1);
    const expected = forcePoints(b);
    assert.equal(b.attacker_points, side === "defender" ? 2500 : 1250);
    assert.equal(b.defender_points, side === "attacker" ? 2500 : 1250);
    assert.equal(b.attacker_points, expected.attacker);
    assert.equal(b.defender_points, expected.defender);
  }
});
