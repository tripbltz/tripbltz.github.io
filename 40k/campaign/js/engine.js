import { assert, effectiveActor, history } from "./services/common.js";
import { finalAssaultUnlocked } from "./services/rules.js";
import {
  createBattle,
  startBattle,
  completeBattle,
  editBattle,
} from "./services/battles.js";
import {
  advanceTurn,
  activateEvent,
  spendResource,
} from "./services/strategy.js";
import {
  saveTerritory,
  saveSettings,
  savePlayer,
  saveFaction,
  saveUnit,
  saveScenario,
  saveEvent,
  saveAction,
  saveChronicle,
  addPhoto,
  removePhoto,
  archiveCampaign,
} from "./services/records.js";

export { getStats } from "./services/statistics.js";
export {
  canAttack,
  getLegalTargets,
  generateScenario,
  finalAssaultUnlocked,
  domination,
  attackAllowance,
} from "./services/rules.js";
export { resultConsequences } from "./services/battles.js";

const commands = Object.freeze({
  create_battle: createBattle,
  start_battle: startBattle,
  complete_battle: completeBattle,
  edit_battle: editBattle,
  advance_turn: advanceTurn,
  save_territory: saveTerritory,
  save_settings: saveSettings,
  save_player: savePlayer,
  save_faction: saveFaction,
  save_unit: saveUnit,
  save_scenario: saveScenario,
  save_event: saveEvent,
  save_action: saveAction,
  activate_event: activateEvent,
  spend_resource: spendResource,
  save_chronicle: saveChronicle,
  add_photo: addPhoto,
  remove_photo: removePhoto,
  archive_campaign: archiveCampaign,
});

/** Every command runs on an isolated snapshot; a failed validation cannot partially mutate data. */
export function applyCommand(state, command, actor) {
  assert(
    state?.campaign && state?.settings && Array.isArray(state.players),
    "Campaign data is missing. Reload the campaign before trying again.",
  );
  assert(
    command &&
      typeof command.type === "string" &&
      Object.hasOwn(commands, command.type),
    "This campaign command is not recognised.",
  );
  assert(
    state.campaign.status !== "archived" || command.type === "archive_campaign",
    "This campaign is archived. Its records are read-only.",
  );
  const resolvedActor = effectiveActor(state, actor);
  const next = structuredClone(state);
  const changed = commands[command.type](
    next,
    command.payload || {},
    resolvedActor,
  );
  if (changed === false) return next;
  for (const player of next.players) {
    if (
      next.campaign.status === "active" &&
      finalAssaultUnlocked(next, player.id) &&
      !finalAssaultUnlocked(state, player.id)
    ) {
      history(next, {
        to_owner_id: player.id,
        title: "THE FINAL ASSAULT UNLOCKED",
        description: `${player.name} has reached the ${next.settings.domination_threshold}% planetary domination threshold and may assault an enemy Planetary Headquarters.`,
      });
    }
  }
  next.campaign.revision = (state.campaign.revision || 0) + 1;
  return next;
}
