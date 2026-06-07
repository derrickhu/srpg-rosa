extends Node

const UNIT_DEFS := {
	"sword": {
		"id": "sword",
		"name": "剑士",
		"max_hp": 100,
		"atk": 18,
		"spd": 5,
		"move": 3,
		"range": 1,
		"is_ranged": false,
		"taunt": false,
		"color": Color(0.86, 0.33, 0.28),
	},
	"bow": {
		"id": "bow",
		"name": "弓手",
		"max_hp": 60,
		"atk": 22,
		"spd": 7,
		"move": 2,
		"range": 3,
		"is_ranged": true,
		"taunt": false,
		"color": Color(0.35, 0.65, 0.35),
	},
	"shield": {
		"id": "shield",
		"name": "盾卫",
		"max_hp": 150,
		"atk": 10,
		"spd": 3,
		"move": 2,
		"range": 1,
		"is_ranged": false,
		"taunt": true,
		"color": Color(0.32, 0.48, 0.86),
	},
}

const ROSTER := ["sword", "bow", "shield"]
const MAX_DEPLOY := 2

var placements: Array[Dictionary] = []


var gold: int = 0
var last_winner: String = ""
var last_rounds: int = 0

func reset_run() -> void:
	placements.clear()
	gold = 0
	last_winner = ""
	last_rounds = 0


func get_stage() -> Dictionary:
	var terrain: Array = _plain_terrain(6, 7)
	terrain[5][2] = "high"
	terrain[6][4] = "high"
	return {
		"id": 1,
		"name": "第 1 关 · 接触战",
		"gold_reward": 8,
		"terrain": terrain,
		"enemies": [
			{"uid": "e_1", "def_id": "sword", "faction": "enemy", "pos": Vector2i(2, 1)},
		],
		"ai_difficulty": "easy",
		"max_deploy": MAX_DEPLOY,
	}


func get_deploy_row_range() -> Vector2i:
	var terrain: Array = get_stage()["terrain"]
	var h: int = terrain.size()
	return Vector2i(max(0, h - 2), max(0, h - 1))


func can_place_at(pos: Vector2i) -> bool:
	var stage: Dictionary = get_stage()
	var terrain: Array = stage["terrain"]
	if pos.y < 0 or pos.y >= terrain.size():
		return false
	if pos.x < 0 or pos.x >= terrain[pos.y].size():
		return false
	var rows: Vector2i = get_deploy_row_range()
	if pos.y < rows.x or pos.y > rows.y:
		return false
	if _placement_at(pos) != null:
		return false
	return placements.size() < MAX_DEPLOY


func deploy_unit(def_id: String, pos: Vector2i) -> bool:
	if not UNIT_DEFS.has(def_id):
		return false
	if not can_place_at(pos):
		return false
	placements.append({
		"uid": "p_%d" % (placements.size() + 1),
		"def_id": def_id,
		"faction": "player",
		"pos": pos,
	})
	return true


func remove_placement_at(pos: Vector2i) -> bool:
	for i in range(placements.size()):
		if placements[i]["pos"] == pos:
			placements.remove_at(i)
			_reindex_player_uids()
			return true
	return false


func placement_at(pos: Vector2i) -> Dictionary:
	for placement in placements:
		if placement["pos"] == pos:
			return placement
	return {}


func build_battle_units() -> Array[Dictionary]:
	var units: Array[Dictionary] = []
	for placement in placements:
		units.append(_make_unit(placement["uid"], placement["def_id"], placement["faction"], placement["pos"]))
	for enemy in get_stage()["enemies"]:
		units.append(_make_unit(enemy["uid"], enemy["def_id"], enemy["faction"], enemy["pos"]))
	return units


const TERRAIN_TEXTURES := {
	"plain": preload("res://art/terrain/plain.png"),
	"high": preload("res://art/terrain/high.png"),
	"forest": preload("res://art/terrain/forest.png"),
	"river": preload("res://art/terrain/river.png"),
	"swamp": preload("res://art/terrain/swamp.png"),
	"wall": preload("res://art/terrain/wall.png"),
	"abyss": preload("res://art/terrain/abyss.png"),
}


func terrain_texture(terrain_id: String) -> Texture2D:
	return TERRAIN_TEXTURES.get(terrain_id, TERRAIN_TEXTURES["plain"])


func terrain_color(terrain_id: String) -> Color:
	match terrain_id:
		"high":
			return Color(0.72, 0.63, 0.38)
		"forest":
			return Color(0.24, 0.55, 0.24)
		"river":
			return Color(0.33, 0.60, 0.87)
		"wall":
			return Color(0.48, 0.48, 0.48)
		_:
			return Color(0.61, 0.73, 0.28)


func unit_label(def_id: String) -> String:
	return UNIT_DEFS.get(def_id, {}).get("name", def_id)


func unit_color(def_id: String) -> Color:
	return UNIT_DEFS.get(def_id, {}).get("color", Color.WHITE)


func _plain_terrain(width: int, height: int) -> Array:
	var rows: Array = []
	for _y in range(height):
		var row: Array = []
		for _x in range(width):
			row.append("plain")
		rows.append(row)
	return rows


func _make_unit(uid: String, def_id: String, faction: String, pos: Vector2i) -> Dictionary:
	var def: Dictionary = UNIT_DEFS[def_id]
	return {
		"uid": uid,
		"def_id": def_id,
		"faction": faction,
		"hp": def["max_hp"],
		"max_hp": def["max_hp"],
		"pos": pos,
		"skill_cd": 0,
		"moved_in_turn": false,
	}


func _placement_at(pos: Vector2i):
	for placement in placements:
		if placement["pos"] == pos:
			return placement
	return null


func _reindex_player_uids() -> void:
	for i in range(placements.size()):
		placements[i]["uid"] = "p_%d" % (i + 1)
