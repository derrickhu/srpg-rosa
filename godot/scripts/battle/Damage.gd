extends RefCounted
class_name Damage

const COUNTER_STRONG := 1.25
const COUNTER_WEAK := 0.85

static func counter_multiplier(attacker: String, target: String) -> float:
	if attacker == "shield" or target == "shield":
		return 1.0
	var strong: bool = (
		(attacker == "cavalry" and target == "sword")
		or (attacker == "sword" and target == "bow")
		or (attacker == "bow" and target == "cavalry")
	)
	var weak: bool = (
		(attacker == "sword" and target == "cavalry")
		or (attacker == "bow" and target == "sword")
		or (attacker == "cavalry" and target == "bow")
	)
	if strong:
		return COUNTER_STRONG
	if weak:
		return COUNTER_WEAK
	return 1.0


static func terrain_attack_mul(terrain: Array, pos: Vector2i) -> float:
	match Pathfinder.get_terrain_at(terrain, pos):
		"high":
			return 1.25
		"river":
			return 0.8
		_:
			return 1.0


static func terrain_defense_mul(terrain: Array, pos: Vector2i) -> float:
	match Pathfinder.get_terrain_at(terrain, pos):
		"wall":
			return 0.5
		_:
			return 1.0


static func terrain_evade(terrain: Array, pos: Vector2i) -> float:
	if Pathfinder.get_terrain_at(terrain, pos) == "forest":
		return 0.3
	return 0.0


static func compute_damage(attacker_def: Dictionary, target_def: Dictionary, terrain: Array, attacker_pos: Vector2i, target_pos: Vector2i) -> int:
	var counter: float = counter_multiplier(attacker_def["id"], target_def["id"])
	var atk_mul: float = terrain_attack_mul(terrain, attacker_pos)
	var def_mul: float = terrain_defense_mul(terrain, target_pos)
	var raw: float = float(attacker_def["atk"]) * counter * atk_mul * def_mul
	return max(1, int(floor(raw)))
