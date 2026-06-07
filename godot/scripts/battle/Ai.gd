extends RefCounted
class_name BattleAi

static func can_attack_from(attacker_def: Dictionary, from_pos: Vector2i, target: Dictionary) -> bool:
	var distance: int = BattleTypes.manhattan(from_pos, target["pos"])
	if attacker_def["is_ranged"]:
		return distance <= int(attacker_def["range"]) and distance >= 1
	return distance == 1


static func choose_turn_action(self_unit: Dictionary, defs: Dictionary, all_units: Array[Dictionary], terrain: Array, difficulty: String = "normal") -> Dictionary:
	var attacker_def: Dictionary = defs[self_unit["def_id"]]
	var blocked: Dictionary = _blocked_cells(all_units, self_unit["uid"])
	var dist: Dictionary = Pathfinder.reachable_cells(self_unit["pos"], int(attacker_def["move"]), blocked, terrain)
	var candidates: Array[Vector2i] = Pathfinder.cells_from_dist(dist)

	var best_score: int = -1
	var best_move_cost: int = 999
	var best_cell: Vector2i = self_unit["pos"]
	var best_target: Dictionary = {}

	for cell in candidates:
		var result: Dictionary = _evaluate_cell(cell, self_unit, attacker_def, all_units, defs, terrain, difficulty)
		var score: int = result["score"]
		var target: Dictionary = result["target"]
		var move_cost: int = BattleTypes.manhattan(cell, self_unit["pos"])
		if score > best_score or (score == best_score and score > 0 and move_cost < best_move_cost):
			best_score = score
			best_move_cost = move_cost
			best_cell = cell
			best_target = target

	if best_score > 0 and not best_target.is_empty():
		return {
			"move_to": null if best_cell == self_unit["pos"] else best_cell,
			"attack_target_uid": best_target["uid"],
		}

	var nearest: Dictionary = _nearest_enemy(self_unit, all_units)
	if nearest.is_empty():
		return {"move_to": null, "attack_target_uid": ""}

	var walk = null
	var best_dist: int = 999
	for cell in candidates:
		if cell == self_unit["pos"]:
			continue
		var distance: int = BattleTypes.manhattan(cell, nearest["pos"])
		if distance < best_dist:
			best_dist = distance
			walk = cell

	return {"move_to": walk, "attack_target_uid": ""}


static func _evaluate_cell(cell: Vector2i, self_unit: Dictionary, attacker_def: Dictionary, all_units: Array[Dictionary], defs: Dictionary, terrain: Array, difficulty: String) -> Dictionary:
	var target: Dictionary = _select_attack_target(attacker_def, cell, _foes(self_unit, all_units), defs, difficulty)
	if target.is_empty():
		return {"score": 0, "target": {}}
	var target_def: Dictionary = defs[target["def_id"]]
	var damage: int = Damage.compute_damage(attacker_def, target_def, terrain, cell, target["pos"])
	var score: int = damage
	if difficulty == "hard" and int(target["hp"]) <= damage:
		score += 20
	return {"score": score, "target": target}


static func _select_attack_target(attacker_def: Dictionary, from_pos: Vector2i, foes: Array[Dictionary], defs: Dictionary, difficulty: String) -> Dictionary:
	var in_range: Array[Dictionary] = []
	for foe in foes:
		if can_attack_from(attacker_def, from_pos, foe):
			in_range.append(foe)
	if in_range.is_empty():
		return {}

	var taunters: Array[Dictionary] = []
	for foe in in_range:
		var def: Dictionary = defs[foe["def_id"]]
		if def.get("taunt", false):
			taunters.append(foe)
	if not taunters.is_empty():
		return _lowest_hp(taunters)

	if difficulty == "hard":
		var best: Dictionary = in_range[0]
		var best_score: float = -INF
		for foe in in_range:
			var score: float = Damage.counter_multiplier(attacker_def["id"], foe["def_id"]) * 10.0 - float(foe["hp"]) * 0.1
			if score > best_score:
				best_score = score
				best = foe
		return best

	return _lowest_hp(in_range)


static func _lowest_hp(units: Array[Dictionary]) -> Dictionary:
	var best: Dictionary = units[0]
	for unit in units:
		if int(unit["hp"]) < int(best["hp"]):
			best = unit
	return best


static func _nearest_enemy(self_unit: Dictionary, all_units: Array[Dictionary]) -> Dictionary:
	var foes: Array[Dictionary] = _foes(self_unit, all_units)
	if foes.is_empty():
		return {}
	var nearest: Dictionary = foes[0]
	for foe in foes:
		if BattleTypes.manhattan(self_unit["pos"], foe["pos"]) < BattleTypes.manhattan(self_unit["pos"], nearest["pos"]):
			nearest = foe
	return nearest


static func _foes(self_unit: Dictionary, all_units: Array[Dictionary]) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for unit in all_units:
		if unit["faction"] != self_unit["faction"] and int(unit["hp"]) > 0:
			out.append(unit)
	return out


static func _blocked_cells(all_units: Array[Dictionary], self_uid: String) -> Dictionary:
	var blocked: Dictionary = {}
	for unit in all_units:
		if int(unit["hp"]) <= 0 or unit["uid"] == self_uid:
			continue
		blocked[BattleTypes.key(unit["pos"])] = true
	return blocked
