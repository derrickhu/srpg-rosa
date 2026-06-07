extends RefCounted
class_name BattleRunner

const MAX_BATTLE_ROUNDS := 200

static func run_battle(initial_units: Array[Dictionary], terrain: Array, defs: Dictionary, ai_difficulty: String = "normal") -> Dictionary:
	var units: Array[Dictionary] = BattleTypes.clone_units(initial_units)
	var events: Array[Dictionary] = []
	var rounds: int = 0

	while rounds < MAX_BATTLE_ROUNDS:
		var winner: String = _check_winner(units)
		if winner != "":
			events.append({"type": "end", "winner": winner})
			return {"events": events, "winner": winner, "rounds": rounds, "final_units": units}

		rounds += 1
		events.append({"type": "round", "round": rounds})

		for unit in units:
			if int(unit["hp"]) <= 0:
				continue
			unit["moved_in_turn"] = false

		var order: Array[Dictionary] = _by_speed_order(units, defs)
		for actor in order:
			var self_unit: Dictionary = _find_unit(units, actor["uid"])
			if self_unit.is_empty() or int(self_unit["hp"]) <= 0:
				continue

			var attacker_def: Dictionary = defs[self_unit["def_id"]]
			var blocked_reach: Dictionary = _blocked_cells(units, self_unit["uid"])
			var reach_dist: Dictionary = Pathfinder.reachable_cells(self_unit["pos"], int(attacker_def["move"]), blocked_reach, terrain)
			events.append({
				"type": "moveRange",
				"uid": self_unit["uid"],
				"cells": Pathfinder.cells_from_dist(reach_dist),
			})

			var choice: Dictionary = BattleAi.choose_turn_action(
				self_unit,
				defs,
				units,
				terrain,
				ai_difficulty if self_unit["faction"] == "enemy" else "normal"
			)

			if choice["move_to"] != null:
				var blocked_path: Dictionary = _blocked_cells(units, self_unit["uid"])
				var path: Array[Vector2i] = Pathfinder.shortest_path4(self_unit["pos"], choice["move_to"], blocked_path, terrain)
				if path.size() > 1:
					for i in range(1, path.size()):
						var from_pos: Vector2i = self_unit["pos"]
						var to_pos: Vector2i = path[i]
						self_unit["pos"] = to_pos
						self_unit["moved_in_turn"] = true
						events.append({
							"type": "moveStep",
							"uid": self_unit["uid"],
							"from": from_pos,
							"to": to_pos,
						})

			var target_uid: String = choice["attack_target_uid"]
			if target_uid != "":
				var target: Dictionary = _find_unit(units, target_uid)
				if not target.is_empty() and int(target["hp"]) > 0 and BattleAi.can_attack_from(attacker_def, self_unit["pos"], target):
					var target_def: Dictionary = defs[target["def_id"]]
					var damage: int = Damage.compute_damage(attacker_def, target_def, terrain, self_unit["pos"], target["pos"])
					target["hp"] = int(target["hp"]) - damage
					events.append({
						"type": "attack",
						"attacker": self_unit["uid"],
						"target": target["uid"],
						"damage": damage,
						"hpLeft": max(0, int(target["hp"])),
						"attackLabel": "普攻",
					})
					if int(target["hp"]) <= 0:
						events.append({"type": "death", "uid": target["uid"]})

			winner = _check_winner(units)
			if winner != "":
				events.append({"type": "end", "winner": winner})
				return {"events": events, "winner": winner, "rounds": rounds, "final_units": units}

	events.append({"type": "end", "winner": "enemy"})
	return {"events": events, "winner": "enemy", "rounds": rounds, "final_units": units}


static func _check_winner(units: Array[Dictionary]) -> String:
	var player_alive: bool = false
	var enemy_alive: bool = false
	for unit in units:
		if int(unit["hp"]) <= 0:
			continue
		if unit["faction"] == "player":
			player_alive = true
		elif unit["faction"] == "enemy":
			enemy_alive = true
	if player_alive and enemy_alive:
		return ""
	if player_alive:
		return "player"
	return "enemy"


static func _by_speed_order(units: Array[Dictionary], defs: Dictionary) -> Array[Dictionary]:
	var order: Array[Dictionary] = BattleTypes.living(units)
	order.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var speed_a: int = int(defs[a["def_id"]]["spd"])
		var speed_b: int = int(defs[b["def_id"]]["spd"])
		if speed_a != speed_b:
			return speed_a > speed_b
		return String(a["uid"]) < String(b["uid"])
	)
	return order


static func _find_unit(units: Array[Dictionary], uid: String) -> Dictionary:
	for unit in units:
		if unit["uid"] == uid:
			return unit
	return {}


static func _blocked_cells(units: Array[Dictionary], self_uid: String) -> Dictionary:
	var blocked: Dictionary = {}
	for unit in units:
		if int(unit["hp"]) <= 0 or unit["uid"] == self_uid:
			continue
		blocked[BattleTypes.key(unit["pos"])] = true
	return blocked
