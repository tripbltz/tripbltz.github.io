import { domination } from "./rules.js";

export function getStats(state) {
  const battles = state.battles.filter((b) => b.status === "completed");
  const byNewest = [...battles].sort((a, b) =>
    (b.completed_at || b.date).localeCompare(a.completed_at || a.date),
  );
  const players = state.players.map((player) => {
    const played = byNewest.filter((b) =>
      [b.attacker_id, b.defender_id].includes(player.id),
    );
    let streak = 0;
    for (const battle of played) {
      if (battle.winner_id === player.id) streak++;
      else break;
    }
    const territories = state.territories.filter(
      (t) => t.owner_id === player.id,
    );
    return {
      ...player,
      territories: territories.length,
      wins: played.filter((b) => b.winner_id === player.id).length,
      losses: played.filter((b) => b.winner_id && b.winner_id !== player.id)
        .length,
      draws: played.filter((b) => b.result === "draw").length,
      domination: domination(state, player.id),
      domination_points: territories.reduce(
        (sum, t) => sum + t.strategic_value,
        0,
      ),
      streak,
      units_destroyed: played
        .filter((b) => b.winner_id === player.id)
        .reduce((sum, b) => sum + Number(b.units_destroyed || 0), 0),
    };
  });
  const scored = battles
    .filter(
      (b) =>
        Number.isFinite(b.attacker_score) && Number.isFinite(b.defender_score),
    )
    .map((b) => ({
      ...b,
      margin: Math.abs(b.attacker_score - b.defender_score),
    }));
  const factionStats = state.factions
    .map((faction) => {
      const played = battles.filter((b) =>
        [b.attacker_faction_id, b.defender_faction_id].includes(faction.id),
      );
      const wins = played.filter((b) =>
        b.result === "attacker"
          ? b.attacker_faction_id === faction.id
          : b.result === "defender" && b.defender_faction_id === faction.id,
      ).length;
      return {
        ...faction,
        battles: played.length,
        wins,
        losses: played.filter((b) => b.result !== "draw").length - wins,
      };
    })
    .filter((f) => f.battles > 0);
  const contested = state.territories
    .map((t) => ({
      ...t,
      battles: state.battles.filter((b) => b.territory_id === t.id).length,
    }))
    .filter((t) => t.battles > 0);
  return {
    players,
    total_battles: battles.length,
    active_battles: state.battles.filter((b) => b.status === "active").length,
    contested: state.territories.filter((t) => t.contested).length,
    neutral: state.territories.filter((t) => !t.owner_id).length,
    largest_victory: [...scored].sort((a, b) => b.margin - a.margin)[0] || null,
    closest_battle: [...scored].sort((a, b) => a.margin - b.margin)[0] || null,
    most_contested:
      contested.sort(
        (a, b) => b.battles - a.battles || b.capture_count - a.capture_count,
      )[0] || null,
    most_successful_faction:
      factionStats.sort((a, b) => b.wins - a.wins || a.losses - b.losses)[0] ||
      null,
    most_successful_unit:
      [...state.units].sort(
        (a, b) => b.victories - a.victories || b.kills - a.kills,
      )[0] || null,
  };
}
