
// === Warhammer 40K Companion App: Complete Reconstructed JavaScript ===

// === Global State Variables ===
let units = [];
let playerCP = { player1: 6, player2: 6 };
let playerVP = { player1: 0, player2: 0 };
let buffs = [];
let effects = [];
let snapshots = [];
let gameLog = [];
let stratagemsUsed = [];
let activePhase = "Command Phase";
let turnNumber = 1;
let phaseHistory = [];
let terrainTags = [];
let objectives = [];
let transports = [];
let psychicPowers = [];
let notes = [];

// === Logging System ===
function logEvent(msg) {
  const log = document.getElementById("log");
  const entry = document.createElement("div");
  entry.textContent = msg;
  log.appendChild(entry);
  gameLog.push(msg);
  log.scrollTop = log.scrollHeight;
}

// === Dice Roll System ===
function rollDice(num, sides = 6) {
  let results = Array.from({ length: num }, () => Math.ceil(Math.random() * sides));
  logEvent(`🎲 Rolled ${num}d${sides}: ${results.join(", ")}`);
  return results;
}

// === Unit System ===
function addUnit(name, models, woundsPerModel) {
  const unit = {
    name,
    models,
    woundsPerModel,
    currentWounds: models * woundsPerModel,
    maxWounds: models * woundsPerModel,
    buffs: [],
    terrain: null
  };
  units.push(unit);
  logEvent(`➕ Unit added: ${name} (${models} models, ${woundsPerModel} wounds/model)`);
}

function applyDamage(name, damage) {
  const unit = units.find(u => u.name === name);
  if (unit) {
    unit.currentWounds = Math.max(unit.currentWounds - damage, 0);
    logEvent(`💥 ${name} took ${damage} damage. Remaining: ${unit.currentWounds}/${unit.maxWounds}`);
  }
}

function healUnit(name, amount) {
  const unit = units.find(u => u.name === name);
  if (unit) {
    unit.currentWounds = Math.min(unit.currentWounds + amount, unit.maxWounds);
    logEvent(`🩹 ${name} healed ${amount} wounds. Now: ${unit.currentWounds}/${unit.maxWounds}`);
  }
}

// === Snapshot System ===
function saveSnapshot() {
  const label = prompt("Label this snapshot:", `Turn ${turnNumber} - ${activePhase}`);
  snapshots.push({
    label: label || new Date().toLocaleString(),
    state: JSON.parse(JSON.stringify({ units, playerCP, playerVP, buffs, effects, gameLog }))
  });
  logEvent(`🧷 Snapshot saved`);
}

function loadSnapshot(index) {
  const snap = snapshots[index].state;
  Object.assign({ units, playerCP, playerVP, buffs, effects, gameLog }, snap);
  logEvent(`📂 Snapshot loaded: ${snapshots[index].label}`);
}

// === CP/VP Handling ===
function spendCP(player, amount) {
  if (playerCP[player] >= amount) {
    playerCP[player] -= amount;
    logEvent(`⚡ ${player} spent ${amount}CP`);
  } else {
    logEvent(`❗ ${player} tried to spend ${amount}CP but has only ${playerCP[player]}`);
  }
}

function addVP(player, amount) {
  playerVP[player] += amount;
  logEvent(`🏅 ${player} scored ${amount}VP`);
}

// === Stratagem Tracking ===
function useStratagem(player, name) {
  const currentPhase = activePhase;
  stratagemsUsed.push({ player, name, phase: currentPhase });
  logEvent(`📛 ${player} used stratagem "${name}" in ${currentPhase}`);
}

function undoStratagem(name) {
  stratagemsUsed = stratagemsUsed.filter(s => s.name !== name);
  logEvent(`↩️ Stratagem "${name}" undone`);
}

// === Phase & Turn Tracker ===
function endPhase() {
  phaseHistory.push(activePhase);
  activePhase = nextPhase(activePhase);
  logEvent(`➡️ Phase changed to: ${activePhase}`);
}

function nextPhase(current) {
  const order = ["Command Phase", "Movement Phase", "Shooting Phase", "Charge Phase", "Fight Phase", "Morale Phase"];
  const idx = order.indexOf(current);
  return idx === order.length - 1 ? "Command Phase" : order[idx + 1];
}

function endTurn() {
  turnNumber++;
  activePhase = "Command Phase";
  buffs = buffs.filter(b => b.duration !== "turn");
  logEvent(`🔁 Turn ${turnNumber} begins`);
}

// === Buffs and Effects ===
function applyBuff(unitName, effect, duration = "turn") {
  buffs.push({ unitName, effect, duration });
  logEvent(`✨ Buff on ${unitName}: ${effect} (${duration})`);
}

function removeBuff(unitName, effect) {
  buffs = buffs.filter(b => b.unitName !== unitName || b.effect !== effect);
  logEvent(`❌ Buff removed from ${unitName}: ${effect}`);
}

// === Rule Assistant ===
const rules = {
  "overwatch": "Overwatch is triggered during opponent's charge phase. Costs 1CP.",
  "cover": "+1 Save from Light Cover unless saving with invulnerable.",
  "feel no pain": "Ignore wounds on X+ depending on the rule.",
  "blast": "Minimum 3 shots if target has 6+ models.",
  "leadership": "Below half strength? Test 2D6 against LD.",
  "perils": "Double 1s or 6s on psychic = D3 mortal wounds."
};

function explainRule(term) {
  const match = Object.keys(rules).find(r => term.toLowerCase().includes(r));
  logEvent(`📘 Rule: ${rules[match] || "Rule not found."}`);
}

// === Terrain Effects ===
function assignTerrain(unitName, terrainType) {
  const unit = units.find(u => u.name === unitName);
  if (unit) {
    unit.terrain = terrainType;
    logEvent(`🌍 ${unitName} moved to terrain: ${terrainType}`);
  }
}

// === Notes ===
function addNote(player, note) {
  notes.push({ player, note });
  logEvent(`📝 ${player} note: ${note}`);
}

// === UI Load (Placeholder) ===
window.onload = () => {
  logEvent("📦 Warhammer 40K Companion App Loaded");
};
