class_name VfxLibrary
extends RefCounted

const SLASH_SCENE := preload("res://scenes/vfx/HitSlash.tscn")


static func spawn_slash_hit(parent: Node, world_pos: Vector2, from_pos: Vector2i, target_pos: Vector2i) -> void:
	var vfx: HitSlashVfx = SLASH_SCENE.instantiate()
	parent.add_child(vfx)
	vfx.global_position = world_pos
	vfx.rotation = _attack_angle(from_pos, target_pos)


static func _attack_angle(from_pos: Vector2i, target_pos: Vector2i) -> float:
	var dx: float = float(target_pos.x - from_pos.x)
	var dy: float = float(target_pos.y - from_pos.y)
	if dx == 0.0 and dy == 0.0:
		return 0.0
	return atan2(dy, dx) + PI * 0.25
