extends RefCounted
class_name BattleTypes

static func key(pos: Vector2i) -> String:
	return "%d,%d" % [pos.x, pos.y]


static func cell_from_key(cell_key: String) -> Vector2i:
	var parts: PackedStringArray = cell_key.split(",")
	return Vector2i(int(parts[0]), int(parts[1]))


static func clone_units(units: Array[Dictionary]) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for unit in units:
		out.append(unit.duplicate(true))
	return out


static func living(units: Array[Dictionary]) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for unit in units:
		if int(unit["hp"]) > 0:
			out.append(unit)
	return out


static func manhattan(a: Vector2i, b: Vector2i) -> int:
	return abs(a.x - b.x) + abs(a.y - b.y)
