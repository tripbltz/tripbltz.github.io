/** A complete authored mission; its objectives and narrative must stay together. */
export function createDestroyAssetScenario(id = crypto.randomUUID()) {
  return {
    id,
    title: "Destroy the asset",
    mission: "Destroy the asset",
    deployment:
      "Agree deployment; roll the escape zone after both armies deploy",
    condition: "BANEBLADE ESCAPE · ASYMMETRIC FORCES",
    narrative:
      "One commander must escort a Baneblade to safety while the opposing army tries to destroy it. Agree and number the eligible escape zones before play, then roll to designate the escape zone only after both armies have deployed. The Baneblade player’s army allowance includes the Baneblade. The opposing player receives twice that total army allowance. For example: 1,000 points including the Baneblade versus 2,000 points. The Baneblade player wins by reaching the designated escape zone with the Baneblade; the opposing player wins by destroying it before it escapes. Agree any remaining mission details before play.",
    attacker_objective:
      "Destroy the Baneblade before it reaches the designated escape zone. Your army has twice the Baneblade player’s total points allowance.",
    defender_objective:
      "Escape with the Baneblade to the designated zone, rolled for after both armies deploy. Your total army allowance includes the Baneblade.",
  };
}

export function forcePoints(battle) {
  const base = Number(battle.points || 0);
  return {
    attacker: base * (battle.asset_side === "defender" ? 2 : 1),
    defender: base * (battle.asset_side === "attacker" ? 2 : 1),
  };
}

export function pointsLabel(battle) {
  const points = forcePoints(battle);
  return battle.asset_side
    ? `${points.attacker.toLocaleString()} vs ${points.defender.toLocaleString()}`
    : points.attacker.toLocaleString();
}

export function defaultTerritoryScenario(state, territory) {
  const titles = {
    "Hive Ashstomp": "No Step Back",
    "Fort Rouse": "No Step Back",
    "The Ash Wastes": "Beneath the Ash",
    "Northern Manufactorum": "Destroy the asset",
    "Ghazghkull’s Landing": "The Last Convoy",
    "Pool House Command": "A Signal in the Dark",
    "Ward-Smith Bastion": "No Step Back",
    "Sam's Smelly Hole": "A Signal in the Dark",
    "Promethium Fields": "The Last Convoy",
    "Orbital Defence Complex": "A Signal in the Dark",
    "The Blackstone Plains": "A Signal in the Dark",
    "Christopia Prime": "No Step Back",
  };
  return (
    state.scenarios.find((s) => s.title === titles[territory.name]) ||
    state.scenarios.find((s) => s.title === "Beneath the Ash") ||
    state.scenarios[0]
  );
}
