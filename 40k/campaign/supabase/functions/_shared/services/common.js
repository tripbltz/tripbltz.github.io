export const newId = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const isUuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
export function assert(condition, message) {
  if (!condition) throw new Error(message);
}
export function find(
  state,
  collection,
  id,
  label = collection.replace(/s$/, ""),
) {
  const record = state[collection].find((item) => item.id === id);
  assert(
    record,
    `The ${label} could not be found. Refresh your campaign and try again.`,
  );
  return record;
}
export function text(value, label, { required = false, max = 20000 } = {}) {
  assert(
    value === undefined || value === null || typeof value === "string",
    `${label} must be text.`,
  );
  const result = String(value ?? "").trim();
  assert(!required || result.length > 0, `Enter ${label.toLowerCase()}.`);
  assert(result.length <= max, `${label} must be ${max} characters or fewer.`);
  return result;
}
export function integer(value, label, min = 0, max = 100000) {
  assert(
    value !== "" &&
      value !== null &&
      value !== undefined &&
      Number.isInteger(Number(value)),
    `${label} must be a whole number.`,
  );
  const result = Number(value);
  assert(
    result >= min && result <= max,
    `${label} must be between ${min} and ${max}.`,
  );
  return result;
}
export function coordinate(value, label) {
  const result = Number(value);
  assert(
    value !== "" &&
      value !== null &&
      Number.isFinite(result) &&
      result >= 0 &&
      result <= 100,
    `${label} must be between 0 and 100.`,
  );
  return result;
}
export function boolean(value, label) {
  assert(typeof value === "boolean", `${label} must be on or off.`);
  return value;
}
export function oneOf(value, choices, label) {
  assert(choices.includes(value), `Choose a valid ${label.toLowerCase()}.`);
  return value;
}
export function colour(value) {
  assert(/^#[0-9a-f]{6}$/i.test(value), "Choose a colour in #RRGGBB format.");
  return value;
}
export function date(value, label = "Date") {
  const result = text(value, label, { required: true, max: 40 });
  assert(
    /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(result) &&
      Number.isFinite(Date.parse(result)),
    `Choose a valid ${label.toLowerCase()}.`,
  );
  const [y, m, d] = result.slice(0, 10).split("-").map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  assert(
    parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d,
    `Choose a valid ${label.toLowerCase()}.`,
  );
  return result;
}
export function imageUrl(value) {
  const result = text(value, "Image URL", { max: 12000000 });
  assert(
    !result ||
      /^(https?:\/\/|data:image\/(?:jpeg|png|webp|gif);base64,|blob:)/i.test(
        result,
      ),
    "Use an HTTP(S) image URL or an uploaded image.",
  );
  return result;
}
export function effectiveActor(state, actor) {
  if (!actor) return { player_id: null, role: "admin", local: true };
  const player = state.players.find((p) => p.id === actor.player_id);
  assert(player, "You are not a player in this campaign.");
  assert(
    ["admin", "player"].includes(actor.role),
    "Your campaign role is invalid.",
  );
  assert(
    actor.role !== "admin" || player.role === "admin",
    "Administrator permission is required.",
  );
  return { player_id: player.id, role: actor.role };
}
export const isAdmin = (actor) => actor.role === "admin";
export function admin(actor) {
  assert(isAdmin(actor), "Only a campaign administrator can make this change.");
}
export function owns(actor, playerId) {
  assert(
    isAdmin(actor) || actor.player_id === playerId,
    "You can only change your own army or campaign resources.",
  );
}
export function participant(actor, battle) {
  assert(
    isAdmin(actor) ||
      [battle.attacker_id, battle.defender_id].includes(actor.player_id),
    "Only the players in this battle can change its report.",
  );
}
export function activeCampaign(state) {
  assert(
    state.campaign.status === "active",
    "This campaign has ended or been archived. Its history is preserved.",
  );
}
export function recordId(state, collection, input) {
  const id = input?.id || newId();
  assert(isUuid(id), "Record identifiers must be valid UUIDs.");
  return { id, existing: state[collection].find((record) => record.id === id) };
}
export function upsert(state, collection, record) {
  const index = state[collection].findIndex((item) => item.id === record.id);
  if (index === -1) state[collection].push(record);
  else state[collection][index] = record;
}
export function history(state, record) {
  state.history.push({
    id: newId(),
    territory_id: null,
    battle_id: null,
    from_owner_id: null,
    to_owner_id: null,
    date: now(),
    ...record,
  });
}
export function resourceTransaction(
  state,
  playerId,
  amount,
  reason,
  details = {},
) {
  const player = find(state, "players", playerId);
  assert(
    player.resources + amount >= 0,
    "You do not have enough campaign resources for this action.",
  );
  player.resources += amount;
  const transaction = {
    id: newId(),
    player_id: playerId,
    amount,
    reason,
    date: now(),
    action_key: null,
    turn: state.campaign.turn,
    territory_id: null,
    consumed: false,
    scenario_options: null,
    ...details,
  };
  state.transactions.push(transaction);
  return transaction;
}
export function transferTerritory(state, territory, newOwner, battle, title) {
  const oldOwner = territory.owner_id;
  if (oldOwner === newOwner) return;
  territory.previous_owner_id = oldOwner;
  territory.owner_id = newOwner;
  territory.capture_count += 1;
  territory.fortified = false;
  const ownerName = (id) =>
    state.players.find((p) => p.id === id)?.name || "Neutral control";
  history(state, {
    territory_id: territory.id,
    battle_id: battle?.id || null,
    from_owner_id: oldOwner,
    to_owner_id: newOwner,
    title: title || `${territory.name} captured`,
    description: `${territory.name}: ${ownerName(oldOwner)} → ${ownerName(newOwner)}.`,
  });
}
