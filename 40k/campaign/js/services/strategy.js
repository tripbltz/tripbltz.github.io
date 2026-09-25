import {
  assert,
  find,
  admin,
  owns,
  activeCampaign,
  history,
  resourceTransaction,
} from "./common.js";
import { generateScenario } from "./rules.js";

function activate(state, event) {
  event.active = true;
  event.remaining_turns = event.duration;
  history(state, {
    title: `Planetary event: ${event.title}`,
    description: event.description,
  });
}

export function activateEvent(state, payload, actor) {
  admin(actor);
  activeCampaign(state);
  let event;
  if (!payload.id || payload.id === "random") {
    const choices = state.events.filter((item) => !item.active);
    assert(
      choices.length,
      "All planetary events are already active. End an event before generating another.",
    );
    event = choices[Math.floor(Math.random() * choices.length)];
  } else event = find(state, "events", payload.id);
  activate(state, event);
  return true;
}

export function advanceTurn(state, payload, actor) {
  admin(actor);
  activeCampaign(state);
  assert(
    !state.battles.some((b) => b.status !== "completed"),
    "Complete the planned and active battles before advancing the campaign turn.",
  );
  state.campaign.turn += 1;
  if (state.settings.resources_enabled) {
    for (const player of state.players) {
      const income = state.territories.filter(
        (t) => t.owner_id === player.id && t.bonus_key === "resource",
      ).length;
      if (income)
        resourceTransaction(
          state,
          player.id,
          income,
          `Strategic territory income — turn ${state.campaign.turn}`,
        );
    }
  }
  for (const event of state.events) {
    if (!event.active) continue;
    event.remaining_turns = Math.max(0, event.remaining_turns - 1);
    if (!event.remaining_turns) event.active = false;
  }
  history(state, {
    title: `Campaign turn ${state.campaign.turn}`,
    description:
      "New attack opportunities are available. Strategic territory income has been distributed where enabled.",
  });
  if (state.settings.random_events_enabled) {
    const choices = state.events.filter((event) => !event.active);
    if (choices.length)
      activate(state, choices[Math.floor(Math.random() * choices.length)]);
  }
  return true;
}

export function spendResource(state, payload, actor) {
  activeCampaign(state);
  assert(
    state.settings.resources_enabled,
    "Campaign resources are disabled in the campaign settings.",
  );
  const player = find(state, "players", payload.player_id || actor.player_id);
  owns(actor, player.id);
  const action = find(state, "actions", payload.action_id, "campaign action");
  assert(
    player.resources >= action.cost,
    `${action.name} costs ${action.cost} resources. ${player.name} currently has ${player.resources}.`,
  );
  assert(
    action.description.trim().toLowerCase() !== "to decide",
    "This resource boost is to decide. No resources have been spent.",
  );
  const details = { action_key: action.key, territory_id: null };
  if (action.key === "fortify") {
    const territory = find(state, "territories", payload.territory_id);
    assert(
      territory.owner_id === player.id,
      "You can only fortify a territory you control.",
    );
    assert(
      !territory.contested,
      "An engagement is already underway here. Fortification must be completed before an attack.",
    );
    assert(!territory.fortified, "This territory is already fortified.");
    territory.fortified = true;
    details.territory_id = territory.id;
    details.consumed = true;
  } else if (action.key === "recon") {
    const first = generateScenario(state);
    let second = generateScenario(state);
    if (state.scenarios.length > 1 && first.id === second.id)
      second = { ...state.scenarios.find((s) => s.id !== first.id) };
    details.scenario_options = [first, second];
  } else
    assert(
      ["redeploy", "counter"].includes(action.key),
      "This campaign action is not supported.",
    );
  resourceTransaction(
    state,
    player.id,
    -action.cost,
    `${action.name}${details.territory_id ? `: ${find(state, "territories", details.territory_id).name}` : ""}`,
    details,
  );
  return true;
}
