import {
  createDestroyAssetScenario,
  defaultTerritoryScenario,
} from "./services/scenarios.js";
/* Shared by the browser and the authenticated server command handler. */
const uuid = (number) =>
  `c4700000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const clone = (value) => structuredClone(value);

export const DEFAULT_SETTINGS = Object.freeze({
  attacks_per_turn: 2,
  resources_enabled: true,
  random_events_enabled: true,
  unit_tracking_enabled: false,
  gameplay_modifiers_enabled: false,
  domination_threshold: 70,
  final_assault_enabled: true,
  final_assault_penalty: 3,
});

const locations = [
  [
    "Hive Ashstomp",
    "An immense hive city built over the remains of the first colonial landing. Its hab-blocks shelter millions.",
    42,
    32,
    "Hive city",
    3,
    0,
    "domination",
  ],
  [
    "Fort Rouse",
    "An ancient fortress guarding the central causeway. The outer walls are scarred by generations of siege warfare.",
    55,
    39,
    "Fortress",
    3,
    0,
    "defence",
  ],
  [
    "The Ash Wastes",
    "Radioactive dunes and abandoned settlements stretch beneath a sky choked with volcanic ash.",
    61,
    56,
    "Wasteland",
    1,
    null,
    "none",
  ],
  [
    "Northern Manufactorum",
    "Kilometres of assembly lines supply armour, munitions and replacement parts to the planetary war effort.",
    48,
    21,
    "Manufactorum",
    2,
    0,
    "resource",
  ],
  [
    "Ghazghkull’s Landing",
    "A captured orbital freight terminal, now surrounded by scrap fortifications and the wreckage of descending roks.",
    72,
    44,
    "Spaceport",
    2,
    1,
    "spaceport",
  ],
  [
    "Pool House Command",
    "The Imperial planetary headquarters is concealed beneath the tranquil ruins of a governors’ retreat.",
    31,
    43,
    "Headquarters",
    3,
    0,
    "defence",
  ],
  [
    "Ward-Smith Bastion",
    "A mountain redoubt whose overlapping gun batteries command the western approaches.",
    29,
    59,
    "Command bastion",
    2,
    0,
    "defence",
  ],
  [
    "Sam's Smelly Hole",
    "Dense, alien forests swallow entire columns. Something vast is moving beneath the canopy.",
    48,
    70,
    "Alien forest",
    1,
    null,
    "none",
  ],
  [
    "Promethium Fields",
    "Burning extraction towers stand above the richest fuel deposits on Christopia.",
    66,
    68,
    "Promethium refinery",
    2,
    1,
    "resource",
  ],
  [
    "Orbital Defence Complex",
    "The last functioning orbital gun array can deny supply ships an entire hemisphere.",
    65,
    27,
    "Defence complex",
    2,
    null,
    "defence",
  ],
  [
    "The Blackstone Plains",
    "Obsidian monoliths disturb every vox signal. Warbands gather among them for reasons the Imperium cannot explain.",
    42,
    83,
    "Blackstone ruins",
    1,
    1,
    "none",
  ],
  [
    "Christopia Prime",
    "Once the planetary capital, now the seat of an invading warlord. Its final spire broadcasts a challenge to the stars.",
    77,
    57,
    "Headquarters",
    3,
    1,
    "domination",
  ],
];

const links = [
  [0, 1],
  [0, 3],
  [0, 5],
  [1, 2],
  [1, 3],
  [1, 4],
  [1, 5],
  [2, 4],
  [2, 7],
  [2, 8],
  [3, 9],
  [4, 9],
  [4, 11],
  [5, 6],
  [6, 7],
  [6, 10],
  [7, 8],
  [7, 10],
  [8, 10],
  [8, 11],
  [9, 11],
];

function referenceData() {
  return {
    scenarios: [
      createDestroyAssetScenario(uuid(505)),
      {
        id: uuid(501),
        title: "Beneath the Ash",
        mission: "Take and Hold",
        deployment: "Dawn of War",
        condition: "ASH STORM",
        narrative:
          "Radioactive ash sweeps across the battlefield. Both commanders must seize the relay before visibility collapses.",
        attacker_objective:
          "Control the communications relay at the end of battle round five.",
        defender_objective:
          "Hold the communications relay and preserve the command chain.",
      },
      {
        id: uuid(502),
        title: "The Last Convoy",
        mission: "Supply Drop",
        deployment: "Hammer and Anvil",
        condition: "SUPPLY SHORTAGE",
        narrative:
          "The final supply convoy has stalled in no-man’s-land. Its cargo could decide the next phase of the planetary war.",
        attacker_objective:
          "Secure two supply objectives at the end of the battle.",
        defender_objective: "Prevent the enemy from taking the supply convoy.",
      },
      {
        id: uuid(503),
        title: "A Signal in the Dark",
        mission: "Priority Targets",
        deployment: "Search and Destroy",
        condition: "VOX BLACKOUT",
        narrative:
          "A powerful signal draws both armies to an abandoned command bunker. Neither side knows what waits below.",
        attacker_objective: "Capture the enemy priority objective.",
        defender_objective:
          "Protect the bunker and eliminate the enemy commander.",
      },
      {
        id: uuid(504),
        title: "No Step Back",
        mission: "Purge the Foe",
        deployment: "Crucible of Battle",
        condition: "ORBITAL DEBRIS",
        narrative:
          "A burning orbital station crosses the sky. On the ground, rival commanders commit their reserves to a decisive assault.",
        attacker_objective:
          "Break the defensive line and control the central objective.",
        defender_objective:
          "Hold the central objective at the end of the battle.",
      },
    ],
    actions: [
      {
        id: uuid(601),
        key: "recon",
        name: "Reconnaissance",
        description:
          "Reveal two narrative scenarios. Choose either when creating your next battle this turn.",
        cost: 1,
      },
      {
        id: uuid(602),
        key: "fortify",
        name: "Fortify",
        description:
          "Mark a controlled territory as fortified until it is attacked. Any tabletop advantage requires agreement as an optional house rule.",
        cost: 2,
      },
      {
        id: uuid(603),
        key: "redeploy",
        name: "Strategic Redeployment",
        description:
          "Launch one attack this turn that would normally be blocked by adjacency.",
        cost: 3,
      },
      {
        id: uuid(604),
        key: "counter",
        name: "Counter-offensive",
        description:
          "Gain one additional attack opportunity during the current campaign turn.",
        cost: 2,
      },
    ],
    events: [
      [
        "Warp Storm",
        "The immaterium boils around Christopia. Supply vessels vanish and distant astropaths fall silent.",
        "Optional house rule: agree a reserve-arrival restriction before deployment.",
        2,
      ],
      [
        "Ash Storm",
        "Great banks of volcanic ash sweep across the central territories.",
        "Optional house rule: agree reduced visibility before the battle.",
        1,
      ],
      [
        "Orbital Bombardment",
        "Fire from orbit scars the landscape. Every army races for shelter.",
        "Optional house rule: place additional craters and ruins by agreement.",
        1,
      ],
      [
        "Supply Shortage",
        "Severed supply lines force commanders to make difficult choices.",
        "Narrative only: describe how your army improvises its supplies.",
        2,
      ],
      [
        "Vox Blackout",
        "Across the planet, every vox set carries the same impossible whisper.",
        "Narrative only: communications are unreliable; normal tabletop rules remain in effect.",
        1,
      ],
      [
        "Solar Flare",
        "A violent flare turns the upper atmosphere into a curtain of amber light.",
        "Narrative only: the next battle takes place beneath burning skies.",
        1,
      ],
      [
        "Tyranid Spore Fall",
        "Organic meteors seed the wilderness with unfamiliar life.",
        "Optional house rule: agree hazardous terrain before the game.",
        2,
      ],
      [
        "Ork Migration",
        "Great columns of ramshackle vehicles converge on the fighting.",
        "Narrative only: distant engines and war cries announce new arrivals.",
        1,
      ],
      [
        "Imperial Reinforcements",
        "A battered Imperial convoy arrives with fresh orders and a promise of relief.",
        "Narrative only: describe the reinforcements without changing army points.",
        1,
      ],
    ].map(([title, description, effect, duration], index) => ({
      id: uuid(701 + index),
      title,
      description,
      effect,
      duration,
      remaining_turns: 0,
      active: false,
    })),
  };
}

function baseState(name, players, settings) {
  const refs = referenceData();
  const factions = [
    {
      id: uuid(11),
      name: "Astra Militarum",
      player_id: players[0].id,
      color: players[0].color,
      description:
        "The battered defenders of Christopia. Every street held is another day bought for the Imperium.",
      image_url: "",
    },
    {
      id: uuid(12),
      name: "Orks",
      player_id: players[1].id,
      color: players[1].color,
      description:
        "A gathering Waaagh! has found a planet worth fighting over. Its warboss intends to keep it.",
      image_url: "",
    },
    {
      id: uuid(13),
      name: "Tyranids",
      player_id: players[1].id,
      color: "#8f79a9",
      description:
        "The first tendrils of a splinter fleet drift toward the planet. The Hive Mind is watching.",
      image_url: "",
    },
  ];
  const territories = locations.map(
    (
      [
        locationName,
        description,
        x,
        y,
        type,
        strategic_value,
        owner,
        bonus_key,
      ],
      index,
    ) => ({
      id: uuid(101 + index),
      name: locationName,
      description,
      x,
      y,
      type,
      strategic_value,
      owner_id: owner === null ? null : players[owner].id,
      previous_owner_id: null,
      contested: false,
      bonus_key,
      capture_count: 0,
      fortified: false,
      headquarters_for:
        index === 5 ? players[0].id : index === 11 ? players[1].id : null,
      image_url: "",
    }),
  );
  for (const territory of territories)
    territory.scenario_id =
      defaultTerritoryScenario({ scenarios: refs.scenarios }, territory)?.id ||
      null;
  for (const action of refs.actions) action.description = "to decide";
  return {
    campaign: {
      id: uuid(1),
      name,
      turn: 1,
      status: "active",
      started_at: new Date().toISOString(),
      winner_id: null,
      ended_at: null,
      revision: 0,
    },
    settings: { ...DEFAULT_SETTINGS, ...settings },
    players,
    factions,
    territories,
    connections: links.map(([a, b]) => ({
      territory_a: territories[a].id,
      territory_b: territories[b].id,
    })),
    battles: [],
    photos: [],
    chronicle: [],
    history: [],
    units: [],
    transactions: [],
    ...refs,
  };
}

export function createEmptyState(
  name = "The War for Christopia",
  playerInputs = [],
  options = {},
) {
  const inputs = playerInputs.length
    ? playerInputs
    : [{ name: "Chris" }, { name: "Player Two" }];
  if (inputs.length < 2)
    throw new Error("A campaign needs at least two players.");
  const players = inputs.map((p, index) => ({
    id: crypto.randomUUID(),
    name: String(p.name || `Player ${index + 1}`).trim(),
    color: p.color || ["#76b3cf", "#d16655", "#ad91c1", "#9caf7b"][index % 4],
    role: index === 0 ? "admin" : "player",
    profile_id: p.profile_id || null,
    resources: 0,
  }));
  const state = baseState(
    name.trim() || "The War for Christopia",
    players,
    options.settings || options,
  );
  state.campaign.id = crypto.randomUUID();
  // Template records receive fresh ids so archived campaigns can coexist.
  const ids = new Map();
  for (const key of [
    "factions",
    "territories",
    "scenarios",
    "actions",
    "events",
  ]) {
    state[key].forEach((record) => {
      const id = crypto.randomUUID();
      ids.set(record.id, id);
      record.id = id;
    });
  }
  state.territories.forEach((t) => {
    t.scenario_id = ids.get(t.scenario_id) || null;
  });
  state.connections = state.connections.map((link) => ({
    territory_a: ids.get(link.territory_a),
    territory_b: ids.get(link.territory_b),
  }));
  if (options.neutral_start)
    state.territories.forEach((t) => {
      t.owner_id = t.headquarters_for;
    });
  if (options.factions) {
    options.factions.forEach((nameOrFaction, index) => {
      if (!state.factions[index]) return;
      state.factions[index].name =
        typeof nameOrFaction === "string"
          ? nameOrFaction
          : nameOrFaction.name || state.factions[index].name;
    });
  }
  return state;
}

export function createDemoState() {
  const players = [
    {
      id: uuid(2),
      name: "Chris",
      color: "#76b3cf",
      role: "admin",
      profile_id: null,
      resources: 6,
    },
    {
      id: uuid(3),
      name: "Player Two",
      color: "#d16655",
      role: "player",
      profile_id: null,
      resources: 4,
    },
  ];
  const state = baseState("The War for Christopia", players, DEFAULT_SETTINGS);
  const [chris, other] = players.map((p) => p.id);
  state.campaign.turn = 7;
  state.campaign.started_at = "2026-06-21T12:00:00.000Z";
  const completed = [
    {
      id: uuid(201),
      name: "The First Battle of Hive Ashstomp",
      territory: 0,
      attacker: chris,
      defender: other,
      result: "attacker",
      scores: [72, 46],
      date: "2026-07-03",
      turn: 1,
      mvp: "Leman Russ “Alice’s Revenge”",
      moment: "A point-blank demolisher shell silenced the enemy warboss.",
      narrative:
        "After three days of brutal street fighting, the guns of Hive Ashstomp fell silent. Imperial banners rose above the transit spire, and the first refugees began to return.",
    },
    {
      id: uuid(202),
      name: "Fire on the Promethium Fields",
      territory: 8,
      attacker: other,
      defender: chris,
      result: "attacker",
      scores: [65, 50],
      date: "2026-07-17",
      turn: 2,
      mvp: "Da Rustjaw Mob",
      moment:
        "A burning trukk rolled through the refinery gates with its passengers still firing.",
      narrative:
        "The refinery burned for a week. When the smoke cleared, the extraction towers were painted red and the invaders had secured the fuel for their next offensive.",
    },
    {
      id: uuid(203),
      name: "The Siege of Ward-Smith Bastion",
      territory: 6,
      attacker: other,
      defender: chris,
      result: "defender",
      scores: [48, 62],
      date: "2026-08-01",
      turn: 3,
      mvp: "The Penelope Guard",
      moment: "The last command squad held the breach against impossible odds.",
      narrative:
        "The bastion endured. Beneath its shattered western gate, exhausted guardsmen counted their dead while the surviving attackers withdrew into the mountains.",
    },
    {
      id: uuid(204),
      name: "Fort Rouse Holds",
      territory: 1,
      attacker: other,
      defender: chris,
      result: "defender",
      scores: [59, 61],
      date: "2026-08-21",
      turn: 5,
      mvp: "Leman Russ “Alice’s Revenge”",
      moment:
        "One surviving guardsman kept the command relay in Imperial hands.",
      narrative:
        "Fort Rouse survived by the narrowest of margins. Its defenders knew the respite would be brief: beyond the causeway, fresh engines were already gathering.",
    },
    {
      id: uuid(205),
      name: "The Blackstone Awakening",
      territory: 10,
      attacker: other,
      defender: chris,
      result: "attacker",
      scores: [68, 54],
      date: "2026-09-05",
      turn: 6,
      mvp: "The Pale Hunger",
      moment:
        "A broodlord emerged from a monolith’s shadow directly behind the command line.",
      narrative:
        "An alien presence stirred among the monoliths. The Imperial expedition was forced to abandon its survey, leaving the plains to a hunger older than the planet’s oldest records.",
    },
  ];
  for (const source of completed) {
    const territory = state.territories[source.territory];
    const winner =
      source.result === "attacker" ? source.attacker : source.defender;
    const isTyranid = source.territory === 10;
    const battle = {
      id: source.id,
      name: source.name,
      territory_id: territory.id,
      attacker_id: source.attacker,
      defender_id: source.defender,
      attacker_faction_id:
        source.attacker === chris ? uuid(11) : isTyranid ? uuid(13) : uuid(12),
      defender_faction_id: source.defender === chris ? uuid(11) : uuid(12),
      points: 1000,
      mission: "Take and Hold",
      deployment: "Dawn of War",
      date: source.date,
      modifier: "",
      notes: "",
      attacker_objective:
        "Take and hold the central objective at the end of battle round five.",
      defender_objective: "Deny the attacker control of the central objective.",
      custom_objective: "",
      campaign_objective: `Victory decides control of ${territory.name}.`,
      status: "completed",
      turn: source.turn,
      is_final_assault: false,
      winner_id: winner,
      result: source.result,
      attacker_score: source.scores[0],
      defender_score: source.scores[1],
      rounds: 5,
      mvp: source.mvp,
      moment: source.moment,
      casualties: "",
      units_destroyed: source.result === "attacker" ? 5 : 4,
      resources_earned: 2,
      completed_at: `${source.date}T20:30:00.000Z`,
    };
    state.battles.push(battle);
    state.chronicle.push({
      id: uuid(301 + state.chronicle.length),
      battle_id: battle.id,
      title: battle.name,
      narrative: source.narrative,
      date: battle.completed_at,
    });
    const captured = source.result === "attacker";
    const fromOwner =
      captured && source.territory !== 10
        ? source.defender
        : captured
          ? null
          : territory.owner_id;
    state.history.push({
      id: uuid(401 + state.history.length),
      territory_id: territory.id,
      battle_id: battle.id,
      from_owner_id: fromOwner,
      to_owner_id: winner,
      title: captured
        ? `${territory.name} captured`
        : `${territory.name} defended`,
      description: captured
        ? `${players.find((p) => p.id === winner).name} took control of ${territory.name}.`
        : `${players.find((p) => p.id === winner).name} held the line at ${territory.name}.`,
      date: battle.completed_at,
    });
    if (captured) {
      territory.previous_owner_id = fromOwner;
      territory.capture_count += 1;
    }
  }
  state.battles.push({
    id: uuid(206),
    name: "Return to Fort Rouse",
    territory_id: uuid(102),
    attacker_id: other,
    defender_id: chris,
    attacker_faction_id: uuid(12),
    defender_faction_id: uuid(11),
    points: 1500,
    mission: "Priority Targets",
    deployment: "Hammer and Anvil",
    date: "2026-09-21",
    modifier:
      "ASH STORM — narrative atmosphere; gameplay modifiers are disabled.",
    notes:
      "The second assault begins at dawn. Both armies have committed their reserves.",
    attacker_objective:
      "Control the command relay at the end of battle round five.",
    defender_objective: "Keep the relay operational and deny enemy control.",
    custom_objective: "",
    campaign_objective:
      "Ork victory captures Fort Rouse and opens the road to Pool House Command.",
    status: "active",
    turn: 7,
    is_final_assault: false,
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
  });
  state.territories[1].contested = true;
  state.territories[5].fortified = true;
  state.events[1].active = true;
  state.events[1].remaining_turns = 1;
  state.units = [];
  return clone(state);
}
