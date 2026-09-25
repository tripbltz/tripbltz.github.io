export function domination(state, playerId) {
  return state.territories.length
    ? (state.territories.filter((t) => t.owner_id === playerId).length /
        state.territories.length) *
        100
    : 0;
}
export function finalAssaultUnlocked(state, playerId) {
  return (
    state.settings.final_assault_enabled &&
    domination(state, playerId) >= state.settings.domination_threshold
  );
}
export function hasAdjacency(state, playerId, territoryId) {
  const owned = new Set(
    state.territories.filter((t) => t.owner_id === playerId).map((t) => t.id),
  );
  return state.connections.some(
    (c) =>
      (c.territory_a === territoryId && owned.has(c.territory_b)) ||
      (c.territory_b === territoryId && owned.has(c.territory_a)),
  );
}
export function hasSpaceport(state, playerId) {
  return state.territories.some(
    (t) => t.owner_id === playerId && t.bonus_key === "spaceport",
  );
}
export function redeployCredit(state, playerId) {
  return (
    state.settings.resources_enabled &&
    state.actions.some(
      (a) => a.key === "redeploy" && a.description !== "to decide",
    ) &&
    state.transactions.find(
      (t) =>
        t.player_id === playerId &&
        t.action_key === "redeploy" &&
        t.turn === state.campaign.turn &&
        !t.consumed,
    )
  );
}
export function attackAllowance(state, playerId) {
  return (
    state.settings.attacks_per_turn +
    (state.settings.resources_enabled &&
    state.actions.some(
      (a) => a.key === "counter" && a.description !== "to decide",
    )
      ? state.transactions.filter(
          (t) =>
            t.player_id === playerId &&
            t.action_key === "counter" &&
            t.turn === state.campaign.turn,
        ).length
      : 0)
  );
}
export function canAttack(
  state,
  playerId,
  territoryId,
  { finalAssault = false } = {},
) {
  const deny = (reason) => ({ allowed: false, reason });
  if (!state?.campaign || state.campaign.status !== "active")
    return deny("This campaign is no longer active.");
  if (!state.players.some((p) => p.id === playerId))
    return deny("Select a campaign player.");
  const territory = state.territories.find((t) => t.id === territoryId);
  if (!territory) return deny("Select a territory on Christopia.");
  if (territory.owner_id === playerId)
    return deny("You already control this territory.");
  if (
    territory.contested ||
    state.battles.some(
      (b) => b.territory_id === territoryId && b.status !== "completed",
    )
  )
    return deny("An engagement is already underway at this territory.");
  if (
    state.battles.filter(
      (b) => b.attacker_id === playerId && b.turn === state.campaign.turn,
    ).length >= attackAllowance(state, playerId)
  )
    return deny(
      "You have used all attacks this turn. Advance the campaign turn to attack again.",
    );
  if (finalAssault) {
    if (!state.settings.final_assault_enabled)
      return deny("Final Assault battles are disabled in campaign settings.");
    if (!finalAssaultUnlocked(state, playerId))
      return deny(
        `Control at least ${state.settings.domination_threshold}% of Christopia to unlock the Final Assault.`,
      );
    if (
      !territory.owner_id ||
      !territory.headquarters_for ||
      territory.headquarters_for === playerId ||
      territory.owner_id !== territory.headquarters_for
    )
      return deny(
        "The Final Assault must target an enemy-controlled Planetary Headquarters.",
      );
    return {
      allowed: true,
      reason:
        "Planetary domination achieved. The enemy headquarters is open to a Final Assault.",
    };
  }
  if (
    state.settings.final_assault_enabled &&
    territory.headquarters_for &&
    territory.headquarters_for !== playerId
  )
    return deny(
      "An enemy headquarters can only be attacked in an unlocked Final Assault.",
    );
  if (hasSpaceport(state, playerId))
    return {
      allowed: true,
      reason: "Your spaceport permits attacks anywhere on Christopia.",
    };
  if (hasAdjacency(state, playerId, territoryId))
    return { allowed: true, reason: "Adjacent to a territory you control." };
  if (redeployCredit(state, playerId))
    return {
      allowed: true,
      reason: "This attack will use your strategic redeployment.",
    };
  return deny(
    "This territory is not adjacent to your holdings. Capture an adjacent location or a spaceport first.",
  );
}
export function getLegalTargets(state, playerId) {
  return state.territories
    .filter(
      (t) =>
        canAttack(state, playerId, t.id, {
          finalAssault: Boolean(
            t.headquarters_for &&
            t.headquarters_for !== playerId &&
            finalAssaultUnlocked(state, playerId),
          ),
        }).allowed,
    )
    .map((t) => t.id);
}

export function generateScenario(state) {
  if (!state.scenarios?.length)
    return {
      title: "The Next Offensive",
      mission: "Take and Hold",
      deployment: "Dawn of War",
      condition: "UNCERTAIN SKIES",
      narrative:
        "Two armies converge on a strategic location. The fate of Christopia will be decided on the ground.",
      attacker_objective: "Control the battlefield objectives.",
      defender_objective: "Deny enemy control of the objectives.",
    };
  // Keep authored mission conditions, narrative and objectives together.
  // Mixing them could detach the Baneblade's escape and asymmetric-points rules.
  return {
    ...state.scenarios[Math.floor(Math.random() * state.scenarios.length)],
  };
}
