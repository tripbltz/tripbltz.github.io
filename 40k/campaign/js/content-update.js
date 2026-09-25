import {
  createDestroyAssetScenario,
  defaultTerritoryScenario,
} from "./services/scenarios.js";

const renames = [
  ["Fort Penelope", "Fort Rouse"],
  ["Hive Ward", "Hive Ashstomp"],
  ["The Hazel Expanse", "Sam's Smelly Hole"],
];
const textFields = new Set([
  "name",
  "title",
  "description",
  "narrative",
  "notes",
  "mission",
  "deployment",
  "modifier",
  "attacker_objective",
  "defender_objective",
  "custom_objective",
  "campaign_objective",
  "mvp",
  "moment",
  "honours",
  "reason",
  "condition",
  "effect",
]);

/** One-time content migration; retains identifiers, game results, photos and ownership. */
export function updateCampaignContent(original) {
  const state = structuredClone(original);
  let changed = false;
  for (const rows of Object.values(state)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (!textFields.has(key) || typeof row[key] !== "string") continue;
        const renamed = renames.reduce(
          (value, [from, to]) => value.replaceAll(from, to),
          row[key],
        );
        if (renamed !== row[key]) {
          row[key] = renamed;
          changed = true;
        }
      }
    }
  }
  if (
    !state.scenarios.some((s) => s.title.toLowerCase() === "destroy the asset")
  ) {
    state.scenarios.push(createDestroyAssetScenario());
    changed = true;
  }
  if (changed) state.campaign.revision = (state.campaign.revision || 0) + 1;
  return { state, changed };
}

export function simplifyCampaignContent(original) {
  const state = structuredClone(original);
  state.settings.unit_tracking_enabled = false;
  for (const territory of state.territories) {
    if (!state.scenarios.some((s) => s.id === territory.scenario_id)) {
      territory.scenario_id =
        defaultTerritoryScenario(state, territory)?.id || null;
    }
  }
  for (const action of state.actions) action.description = "to decide";
  state.campaign.revision = (state.campaign.revision || 0) + 1;
  return state;
}
