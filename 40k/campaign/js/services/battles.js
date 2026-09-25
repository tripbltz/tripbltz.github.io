import { forcePoints } from "./scenarios.js";
import {
  assert,
  find,
  text,
  integer,
  date,
  boolean,
  oneOf,
  now,
  newId,
  recordId,
  participant,
  owns,
  activeCampaign,
  admin,
  history,
  resourceTransaction,
  transferTerritory,
} from "./common.js";
import {
  canAttack,
  hasAdjacency,
  hasSpaceport,
  redeployCredit,
  domination,
} from "./rules.js";

function factionFor(state, id, playerId) {
  const faction = id
    ? find(state, "factions", id)
    : state.factions.find((f) => f.player_id === playerId);
  assert(
    faction && faction.player_id === playerId,
    "Choose a faction belonging to the selected player.",
  );
  return faction.id;
}

export function createBattle(state, payload, actor) {
  activeCampaign(state);
  let input = payload.battle || payload;
  const { id, existing } = recordId(state, "battles", input);
  assert(!existing, "This battle already exists. Open its existing report.");
  const attacker = find(state, "players", input.attacker_id || actor.player_id);
  owns(actor, attacker.id);
  const territory = find(state, "territories", input.territory_id);
  const scenario = find(
    state,
    "scenarios",
    territory.scenario_id,
    "scenario assigned to this territory",
  );
  const assetSide =
    scenario.mission.toLowerCase() === "destroy the asset"
      ? input.asset_side || "defender"
      : null;
  input = {
    ...input,
    mission: scenario.mission,
    deployment: scenario.deployment,
    modifier: scenario.condition,
    attacker_objective:
      assetSide === "attacker"
        ? scenario.defender_objective
        : scenario.attacker_objective,
    defender_objective:
      assetSide === "attacker"
        ? scenario.attacker_objective
        : scenario.defender_objective,
    custom_objective: "",
    asset_side: assetSide,
  };
  const finalAssault =
    input.is_final_assault === undefined
      ? false
      : boolean(input.is_final_assault, "Final Assault");
  const legality = canAttack(state, attacker.id, territory.id, {
    finalAssault,
  });
  assert(legality.allowed, legality.reason);
  const defender = find(
    state,
    "players",
    input.defender_id ||
      territory.owner_id ||
      state.players.find((p) => p.id !== attacker.id)?.id,
  );
  assert(
    defender.id !== attacker.id,
    "Attacker and defender must be different players.",
  );
  assert(
    !territory.owner_id || defender.id === territory.owner_id,
    "The defending player must control the target territory.",
  );
  const wasFortified = territory.fortified;
  const battle = {
    id,
    name: text(
      input.name ||
        `${finalAssault ? "The Final Assault on" : "Battle for"} ${territory.name}`,
      "Battle name",
      { required: true, max: 200 },
    ),
    territory_id: territory.id,
    attacker_id: attacker.id,
    defender_id: defender.id,
    attacker_faction_id: factionFor(
      state,
      input.attacker_faction_id,
      attacker.id,
    ),
    defender_faction_id: factionFor(
      state,
      input.defender_faction_id,
      defender.id,
    ),
    points: integer(input.points ?? 1000, "Points", 100, 100000),
    mission: text(input.mission || "Take and Hold", "Mission", {
      required: true,
      max: 200,
    }),
    deployment: text(input.deployment || "Dawn of War", "Deployment", {
      max: 200,
    }),
    date: date(input.date || now().slice(0, 10)),
    modifier: text(input.modifier, "Narrative modifier"),
    notes: text(input.notes, "Notes"),
    attacker_objective: text(
      input.attacker_objective ||
        "Win the agreed mission and claim this territory.",
      "Attacker objective",
    ),
    defender_objective: text(
      input.defender_objective ||
        "Win the agreed mission and hold the territory.",
      "Defender objective",
    ),
    custom_objective: text(input.custom_objective, "Custom objective"),
    campaign_objective: text(
      input.campaign_objective ||
        (finalAssault
          ? "Attacker victory ends the campaign. Defender victory forces an enemy withdrawal."
          : `Attacker victory captures ${territory.name}. Defender victory or a draw preserves current control.`),
      "Campaign objective",
    ),
    status: oneOf(
      input.status || "planned",
      ["planned", "active"],
      "Battle status",
    ),
    turn: state.campaign.turn,
    is_final_assault: finalAssault,
    winner_id: null,
    result: null,
    attacker_score: null,
    defender_score: null,
    rounds: null,
    mvp: "",
    moment: "",
    casualties: "",
    units_destroyed: 0,
    resources_earned: 0,
    completed_at: null,
  };
  battle.asset_side = input.asset_side
    ? oneOf(input.asset_side, ["attacker", "defender"], "Baneblade player")
    : null;
  const allowances = forcePoints(battle);
  battle.attacker_points = allowances.attacker;
  battle.defender_points = allowances.defender;
  if (wasFortified)
    battle.modifier = [
      battle.modifier,
      `FORTIFIED POSITION — ${state.settings.gameplay_modifiers_enabled ? "optional house rule; agree any advantage before play" : "narrative only; gameplay modifiers are disabled"}.`,
    ]
      .filter(Boolean)
      .join("\n");
  if (
    !finalAssault &&
    !hasAdjacency(state, attacker.id, territory.id) &&
    !hasSpaceport(state, attacker.id)
  )
    redeployCredit(state, attacker.id).consumed = true;
  const recon = state.transactions.find(
    (tx) =>
      tx.player_id === attacker.id &&
      tx.action_key === "recon" &&
      tx.turn === state.campaign.turn &&
      !tx.consumed,
  );
  if (recon) recon.consumed = true;
  state.battles.push(battle);
  territory.contested = true;
  territory.fortified = false;
  return true;
}

export function startBattle(state, payload, actor) {
  activeCampaign(state);
  const battle = find(state, "battles", payload.id);
  participant(actor, battle);
  assert(
    battle.status !== "completed",
    "This battle has already been completed.",
  );
  if (battle.status === "active") return false;
  battle.status = "active";
  return true;
}

function penaltyTerritories(state, battle, requested) {
  const owned = state.territories.filter(
    (t) => t.owner_id === battle.attacker_id,
  );
  const count = Math.min(state.settings.final_assault_penalty, owned.length);
  let selected;
  if (requested !== undefined) {
    assert(
      Array.isArray(requested) && new Set(requested).size === requested.length,
      "Choose different territories for the Final Assault penalty.",
    );
    assert(
      requested.length === count,
      `Choose exactly ${count} territories to relinquish.`,
    );
    selected = requested.map((id) => find(state, "territories", id));
    assert(
      selected.every((t) => t.owner_id === battle.attacker_id),
      "Only the attacking player’s territories can be relinquished.",
    );
  } else {
    selected = owned
      .sort(
        (a, b) =>
          Number(a.contested) - Number(b.contested) ||
          Number(Boolean(a.headquarters_for)) -
            Number(Boolean(b.headquarters_for)) ||
          a.strategic_value - b.strategic_value ||
          a.id.localeCompare(b.id),
      )
      .slice(0, count);
  }
  assert(
    selected.every((t) => !t.contested),
    "Finish the engagements in the penalty territories before resolving the Final Assault, or choose other territories.",
  );
  return selected;
}

function resultDetails(state, battle, payload) {
  const result = oneOf(
    payload.result,
    ["attacker", "defender", "draw"],
    "Battle result",
  );
  const winnerId =
    result === "attacker"
      ? battle.attacker_id
      : result === "defender"
        ? battle.defender_id
        : null;
  const resources =
    state.settings.resources_enabled && winnerId
      ? integer(payload.resources_earned ?? 2, "Resources earned", 0, 100)
      : 0;
  return {
    result,
    winnerId,
    resources,
    penalties:
      battle.is_final_assault && result === "defender"
        ? penaltyTerritories(state, battle, payload.penalty_territory_ids)
        : [],
  };
}

export function resultConsequences(state, battleId, input) {
  const battle = find(state, "battles", battleId);
  const payload = typeof input === "string" ? { result: input } : input;
  assert(payload && typeof payload === "object", "Choose the battle result.");
  const { result, winnerId, resources, penalties } = resultDetails(
    state,
    battle,
    payload,
  );
  const territory = find(state, "territories", battle.territory_id);
  const territoryTo =
    result === "attacker" ? battle.attacker_id : territory.owner_id;
  const playerName = (id) =>
    state.players.find((p) => p.id === id)?.name || "Neutral control";
  const sentences = [
    result === "draw"
      ? "The battle ends in a draw."
      : `${playerName(winnerId)} wins.`,
  ];
  if (territoryTo !== territory.owner_id)
    sentences.push(
      `${territory.name}: ${playerName(territory.owner_id)} → ${playerName(territoryTo)}. ${playerName(territoryTo)} gains 1 territory and ${territory.strategic_value} domination points.`,
    );
  else
    sentences.push(
      `${territory.name} remains under ${playerName(territory.owner_id)}.`,
    );
  if (resources)
    sentences.push(
      `${playerName(winnerId)} gains ${resources} campaign resources.`,
    );
  if (penalties.length)
    sentences.push(
      `${playerName(battle.attacker_id)} must relinquish ${penalties.map((t) => t.name).join(", ")} to neutral control.`,
    );
  const before = domination(state, battle.attacker_id);
  const after =
    before +
    (territoryTo !== territory.owner_id ? 100 / state.territories.length : 0);
  const unlocked = Boolean(
    state.settings.final_assault_enabled &&
    before < state.settings.domination_threshold &&
    after >= state.settings.domination_threshold,
  );
  const ends = battle.is_final_assault && result === "attacker";
  if (ends)
    sentences.push(
      `CHRISTOPIA HAS FALLEN. ${playerName(winnerId)} wins the campaign. All battle history is preserved.`,
    );
  else if (unlocked)
    sentences.push(
      "The planetary domination threshold is reached. The Final Assault is now unlocked.",
    );
  sentences.push("A battle report and Chronicle entry will be saved.");
  return {
    text: sentences.join("\n\n"),
    territory_from: territory.owner_id,
    territory_to: territoryTo,
    resources,
    final_assault_unlocked: unlocked,
    campaign_ends: ends,
    penalty_territory_ids: penalties.map((t) => t.id),
  };
}

export function completeBattle(state, payload, actor) {
  const battle = find(state, "battles", payload.id);
  participant(actor, battle);
  // This check happens before activeCampaign: a retried final victory remains safe.
  if (battle.status === "completed") {
    assert(
      !payload.result || battle.result === payload.result,
      "This battle is already completed. Its recorded outcome cannot be submitted again with a different result.",
    );
    return false;
  }
  activeCampaign(state);
  const territory = find(state, "territories", battle.territory_id);
  assert(
    !territory.owner_id || territory.owner_id === battle.defender_id,
    "Territory ownership changed after this battle was created. Ask the campaign administrator to review it.",
  );
  const { result, winnerId, resources, penalties } = resultDetails(
    state,
    battle,
    payload,
  );
  const values = {
    attacker_score: integer(
      payload.attacker_score ?? 0,
      "Attacker score",
      0,
      10000,
    ),
    defender_score: integer(
      payload.defender_score ?? 0,
      "Defender score",
      0,
      10000,
    ),
    rounds: integer(payload.rounds ?? 5, "Battle rounds", 0, 20),
    units_destroyed: integer(
      payload.units_destroyed ?? 0,
      "Enemy units destroyed by the winner",
      0,
      1000,
    ),
    mvp: text(payload.mvp ?? battle.mvp, "MVP"),
    moment: text(payload.moment ?? battle.moment, "Memorable moment"),
    notes: text(payload.notes ?? battle.notes, "Notes"),
    casualties: text(payload.casualties ?? battle.casualties, "Casualties"),
    date: date(payload.date || battle.date),
  };
  Object.assign(battle, values, {
    result,
    winner_id: winnerId,
    resources_earned: resources,
    status: "completed",
    completed_at: now(),
  });
  territory.contested = false;
  if (result === "attacker")
    transferTerritory(state, territory, battle.attacker_id, battle);
  else
    history(state, {
      territory_id: territory.id,
      battle_id: battle.id,
      from_owner_id: territory.owner_id,
      to_owner_id: territory.owner_id,
      title:
        result === "draw"
          ? `Stalemate at ${territory.name}`
          : `${territory.name} defended`,
      description:
        result === "draw"
          ? "Neither force secured a decisive advantage. Territorial control is unchanged."
          : "The attacking force was repelled. Territorial control is unchanged.",
    });
  for (const lost of penalties)
    transferTerritory(
      state,
      lost,
      null,
      battle,
      `${lost.name} abandoned after the Final Assault`,
    );
  if (resources)
    resourceTransaction(state, winnerId, resources, `Victory: ${battle.name}`);
  const winnerFaction = state.factions.find(
    (f) =>
      f.id ===
      (result === "attacker"
        ? battle.attacker_faction_id
        : battle.defender_faction_id),
  );
  const loserFaction = state.factions.find(
    (f) =>
      f.id ===
      (result === "attacker"
        ? battle.defender_faction_id
        : battle.attacker_faction_id),
  );
  const narrative = `${result === "draw" ? "Both forces fought to a standstill" : `${winnerFaction?.name || "The victorious force"} defeated ${loserFaction?.name || "the opposition"}`} at ${territory.name}, ${battle.attacker_score}–${battle.defender_score}. ${result === "attacker" ? "The territory changed hands." : "Control of the territory was unchanged."}${battle.moment ? ` ${battle.moment}` : ""}`;
  state.chronicle.push({
    id: newId(),
    battle_id: battle.id,
    title: battle.name,
    narrative,
    date: battle.completed_at,
  });
  if (battle.is_final_assault && result === "attacker") {
    state.campaign.status = "completed";
    state.campaign.winner_id = winnerId;
    state.campaign.ended_at = battle.completed_at;
    history(state, {
      battle_id: battle.id,
      territory_id: territory.id,
      to_owner_id: winnerId,
      title: "CHRISTOPIA HAS FALLEN",
      description: `${state.players.find((p) => p.id === winnerId).name} won the Final Assault. The campaign is complete; its history will endure.`,
    });
  }
  return true;
}

export function editBattle(state, payload, actor) {
  admin(actor);
  const input = payload.battle || payload;
  const battle = find(state, "battles", input.id);
  for (const key of [
    "asset_side",
    "territory_id",
    "attacker_id",
    "defender_id",
    "attacker_faction_id",
    "defender_faction_id",
    "turn",
    "is_final_assault",
    "status",
    "completed_at",
  ])
    assert(
      input[key] === undefined || input[key] === battle[key],
      "Changing battle identity would invalidate campaign history.",
    );
  if (input.result !== undefined && input.result !== battle.result)
    return correctBattleResult(state, input, actor);
  const immutable = [
    "asset_side",
    "territory_id",
    "attacker_id",
    "defender_id",
    "attacker_faction_id",
    "defender_faction_id",
    "turn",
    "is_final_assault",
    "winner_id",
    "result",
    "resources_earned",
    "status",
    "completed_at",
  ];
  for (const key of immutable)
    assert(
      input[key] === undefined || input[key] === battle[key],
      `Changing ${key.replaceAll("_", " ")} would invalidate campaign history. Create a new battle; report details can still be edited.`,
    );
  const texts = [
    "name",
    "mission",
    "deployment",
    "modifier",
    "notes",
    "attacker_objective",
    "defender_objective",
    "custom_objective",
    "campaign_objective",
    "mvp",
    "moment",
    "casualties",
  ];
  for (const key of texts)
    if (input[key] !== undefined)
      battle[key] = text(input[key], key.replaceAll("_", " "), {
        required: key === "name",
      });
  for (const key of [
    "attacker_score",
    "defender_score",
    "rounds",
    "units_destroyed",
    "points",
  ])
    if (input[key] !== undefined && input[key] !== null)
      battle[key] = integer(
        input[key],
        key.replaceAll("_", " "),
        key === "points" ? 100 : 0,
        key === "rounds" ? 20 : 100000,
      );
  const allowances = forcePoints(battle);
  battle.attacker_points = allowances.attacker;
  battle.defender_points = allowances.defender;
  if (input.date !== undefined) battle.date = date(input.date);
  const entry = state.chronicle.find((item) => item.battle_id === battle.id);
  if (entry) entry.title = battle.name;
  return true;
}

/** Correct only a recent, independent result. Never replay or rewrite downstream games. */
function correctBattleResult(state, input, actor) {
  activeCampaign(state);
  const battle = find(state, "battles", input.id);
  assert(
    battle.status === "completed" && !battle.is_final_assault,
    "Only a completed standard battle can have its outcome corrected.",
  );
  assert(
    battle.turn === state.campaign.turn &&
      state.battles.at(-1).id === battle.id,
    "This result has subsequent campaign history. Only the most recently created battle in the current turn can have its outcome corrected.",
  );
  const territory = find(state, "territories", battle.territory_id);
  assert(
    !territory.contested &&
      !state.battles.some(
        (b) =>
          b.id !== battle.id &&
          b.territory_id === territory.id &&
          b.status !== "completed",
      ),
    "Resolve the current engagement before correcting this territory.",
  );
  const oldHistoryIndex = state.history.findLastIndex(
    (h) => h.battle_id === battle.id && h.territory_id === territory.id,
  );
  const oldHistory = state.history[oldHistoryIndex];
  assert(
    oldHistory,
    "The original control record is missing; this outcome cannot be safely corrected.",
  );
  assert(
    !state.history
      .slice(oldHistoryIndex + 1)
      .some((h) => h.territory_id && h.battle_id !== battle.id),
    "Subsequent territory changes prevent this outcome correction.",
  );
  assert(
    territory.owner_id === oldHistory.to_owner_id,
    "Territory control has changed since this result. Its outcome cannot be safely corrected.",
  );
  assert(
    !state.transactions.some(
      (tx) =>
        tx.date >= battle.completed_at &&
        tx.amount < 0 &&
        !tx.reason.startsWith("Correction:"),
    ),
    "Campaign resources have been spent since this result. Correct report details instead of rewriting the outcome.",
  );
  const originalResult = battle.result;
  const originalCompletedAt = battle.completed_at;
  const originalEntry = state.chronicle.find(
    (entry) => entry.battle_id === battle.id,
  );
  const originalNarrative = originalEntry?.narrative || "";
  if (battle.resources_earned && battle.winner_id)
    resourceTransaction(
      state,
      battle.winner_id,
      -battle.resources_earned,
      `Correction: reverse award for ${battle.name}`,
    );
  if (originalResult === "attacker") {
    territory.owner_id = oldHistory.from_owner_id;
    territory.capture_count = Math.max(0, territory.capture_count - 1);
    const priorCapture = state.history
      .slice(0, oldHistoryIndex)
      .findLast(
        (h) =>
          h.territory_id === territory.id && h.from_owner_id !== h.to_owner_id,
      );
    territory.previous_owner_id = priorCapture?.from_owner_id || null;
  }
  // Preserve the original dispatch as an explicit correction audit, not a second current result.
  oldHistory.title = `Superseded result: ${oldHistory.title}`;
  oldHistory.description += ` Administrative correction: ${originalResult} changed to ${input.result}.`;
  state.chronicle = state.chronicle.filter(
    (entry) => entry.battle_id !== battle.id,
  );
  const original = { ...battle };
  battle.status = "active";
  battle.result = null;
  completeBattle(
    state,
    {
      ...original,
      ...input,
      id: battle.id,
      resources_earned: original.resources_earned,
    },
    actor,
  );
  const newEntry = state.chronicle.find(
    (entry) => entry.battle_id === battle.id,
  );
  newEntry.id = originalEntry?.id || newEntry.id;
  newEntry.narrative += `\n\nCorrected by campaign command. Original dispatch: ${originalNarrative}`;
  // Report text amendments accompany the corrected outcome; identity fields stay fixed.
  for (const key of ["name", "mvp", "moment", "notes"])
    if (input[key] !== undefined)
      battle[key] = text(input[key], key, { required: key === "name" });
  newEntry.title = battle.name;
  history(state, {
    battle_id: battle.id,
    title: "Battle result corrected",
    description: `${battle.name}: ${originalResult} → ${battle.result}. The earlier result from ${originalCompletedAt} has been superseded. Territory control, resources and statistics have been reconciled.`,
  });
  return true;
}
