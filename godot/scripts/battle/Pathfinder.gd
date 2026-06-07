extends RefCounted
class_name Pathfinder

static func grid_size(terrain: Array) -> Vector2i:
	var h: int = terrain.size()
	var w: int = 0
	if h > 0:
		w = terrain[0].size()
	return Vector2i(w, h)


static func in_bounds(pos: Vector2i, terrain: Array) -> bool:
	var size: Vector2i = grid_size(terrain)
	return pos.x >= 0 and pos.x < size.x and pos.y >= 0 and pos.y < size.y


static func get_terrain_at(terrain: Array, pos: Vector2i) -> String:
	if not in_bounds(pos, terrain):
		return "plain"
	return terrain[pos.y][pos.x]


static func movement_cost(terrain_id: String) -> float:
	match terrain_id:
		"forest", "swamp":
			return 2.0
		"river":
			return 3.0
		"wall", "abyss":
			return INF
		_:
			return 1.0


static func neighbors4(pos: Vector2i, terrain: Array) -> Array[Vector2i]:
	var candidates: Array[Vector2i] = [
		Vector2i(pos.x + 1, pos.y),
		Vector2i(pos.x - 1, pos.y),
		Vector2i(pos.x, pos.y + 1),
		Vector2i(pos.x, pos.y - 1),
	]
	var out: Array[Vector2i] = []
	for cell in candidates:
		if in_bounds(cell, terrain):
			out.append(cell)
	return out


static func reachable_cells(start: Vector2i, move_budget: int, blocked: Dictionary, terrain: Array) -> Dictionary:
	var dist: Dictionary = {}
	var queue: Array[Vector2i] = [start]
	dist[BattleTypes.key(start)] = 0.0
	var qi: int = 0
	while qi < queue.size():
		var pos: Vector2i = queue[qi]
		qi += 1
		var current_cost: float = dist[BattleTypes.key(pos)]
		for next in neighbors4(pos, terrain):
			var next_key: String = BattleTypes.key(next)
			if next_key == BattleTypes.key(start):
				continue
			if blocked.has(next_key):
				continue
			var step: float = movement_cost(get_terrain_at(terrain, next))
			if step >= INF:
				continue
			var new_cost: float = current_cost + step
			if new_cost > move_budget:
				continue
			if not dist.has(next_key) or new_cost < float(dist[next_key]):
				dist[next_key] = new_cost
				queue.append(next)
	return dist


static func cells_from_dist(dist: Dictionary) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for cell_key in dist.keys():
		out.append(BattleTypes.cell_from_key(cell_key))
	return out


static func shortest_path4(from: Vector2i, to: Vector2i, blocked: Dictionary, terrain: Array) -> Array[Vector2i]:
	if from == to:
		var same_cell_path: Array[Vector2i] = [from]
		return same_cell_path
	if blocked.has(BattleTypes.key(to)):
		return []
	if movement_cost(get_terrain_at(terrain, to)) >= INF:
		return []

	var from_key: String = BattleTypes.key(from)
	var to_key: String = BattleTypes.key(to)
	var dist: Dictionary = {from_key: 0.0}
	var parent: Dictionary = {from_key: ""}
	var queue: Array[Vector2i] = [from]
	var qi: int = 0

	while qi < queue.size():
		var pos: Vector2i = queue[qi]
		qi += 1
		var pos_key: String = BattleTypes.key(pos)
		if pos_key == to_key:
			var path: Array[Vector2i] = []
			var current: String = to_key
			while current != "" and current != from_key:
				path.append(BattleTypes.cell_from_key(current))
				current = parent[current]
			path.append(from)
			path.reverse()
			return path

		var current_cost: float = dist[pos_key]
		for next in neighbors4(pos, terrain):
			var next_key: String = BattleTypes.key(next)
			if blocked.has(next_key):
				continue
			var step: float = movement_cost(get_terrain_at(terrain, next))
			if step >= INF:
				continue
			var new_cost: float = current_cost + step
			if not dist.has(next_key) or new_cost < float(dist[next_key]):
				dist[next_key] = new_cost
				parent[next_key] = pos_key
				queue.append(next)

	return []
