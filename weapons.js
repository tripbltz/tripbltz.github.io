// Weapon profiles for the game
const weaponProfiles = {
	"lasgun": {
		name: "Lasgun",
		range: 24,
		attacks: 1,
		bs: 3,
		strength: 3,
		ap: 0,
		damage: 1,
		abilities: []
	},
	"hot-shot-lasgun": {
		name: "Hot-shot Lasgun",
		range: 24,
		attacks: 1,
		bs: 3,
		strength: 3,
		ap: 1,
		damage: 1,
		abilities: ["Rapid Fire 1"]
	},
	"meltagun": {
		name: "Meltagun",
		range: 12,
		attacks: 1,
		bs: 4,
		strength: 9,
		ap: 4,
		damage: "D6",
		abilities: ["Melta 2"]
	},
	"multi-laser": {
		name: "Multi-laser",
		range: 36,
		attacks: 4,
		bs: 4,
		strength: 6,
		ap: 0,
		damage: 1,
		abilities: []
	},
	"ripper-gun": {
		name: "Ripper Gun",
		range: 12,
		attacks: 3,
		bs: 4,
		strength: 5,
		ap: 0,
		damage: 1,
		abilities: ["Assault"]
	},
	"melta-rifle": {
		name: "Melta Rifle",
		range: 18,
		attacks: 1,
		bs: 3,
		strength: 9,
		ap: 4,
		damage: "D6",
		abilities: ["Melta 2"]
	},
	"power-sword": {
		name: "Power Sword",
		range: "Melee",
		attacks: 3,
		ws: 3,
		strength: 5,
		ap: 2,
		damage: 1,
		abilities: []
	},
	"plasma-cutter": {
		name: "Plasma Cutter",
		range: 12,
		attacks: 2,
		bs: 3,
		strength: 7,
		ap: 2,
		damage: 1,
		abilities: []
	},
	"venom-cannon": {
		name: "Venom Cannon",
		range: 36,
		attacks: 4,
		bs: 4,
		strength: 9,
		ap: 2,
		damage: 3,
		abilities: []
	},
	"monstrous-bonesword": {
		name: "Monstrous Bonesword",
		range: "Melee",
		attacks: 4,
		ws: 3,
		strength: 8,
		ap: 2,
		damage: 2,
		abilities: []
	},
	"monstrous-scything-talons": {
		name: "Monstrous Scything Talons",
		range: "Melee",
		attacks: 6,
		ws: 3,
		strength: 7,
		ap: 2,
		damage: 2,
		abilities: ["Re-roll Hit rolls of 1"]
	},
	"impaler-cannon": {
		name: "Impaler Cannon",
		range: 36,
		attacks: 2,
		bs: 4,
		strength: 7,
		ap: 1,
		damage: 2,
		abilities: []
	},
	"warp-blast": {
		name: "Warp Blast",
		range: 18,
		attacks: "D3",
		bs: 3,
		strength: 10,
		ap: 3,
		damage: "D6",
		abilities: ["Psychic"]
	},
	"boltgun": {
		name: "Boltgun",
		range: 24,
		attacks: 1,
		bs: 3,
		strength: 4,
		ap: 0,
		damage: 1,
		abilities: ["Rapid Fire 1"]
	},
	"rending-claws": {
		name: "Rending Claws",
		range: "Melee",
		attacks: 4,
		ws: 3,
		strength: 4,
		ap: 1,
		damage: 1,
		abilities: ["Critical hits have AP-4"]
	}
};