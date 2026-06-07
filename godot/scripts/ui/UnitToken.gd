class_name UnitToken
extends Node2D

const SOURCE_FRAME_SIZE := 512.0
const MIN_MOVE_DURATION := 0.35
const UNIT_SCALE := 1.5

var animated_sprite: AnimatedSprite2D
var hp_overlay: Node2D
var uses_sprite: bool = false
var cell_size: float = 72.0
var hp_bar_width: float = 0.0
var current_hp: int = 0
var max_hp: int = 1
var faction: String = "player"
var def_id: String = ""
var last_facing: StringName = &"down"


func setup(unit: Dictionary, next_cell_size: float) -> void:
	cell_size = next_cell_size
	faction = unit["faction"]
	def_id = unit["def_id"]
	# 玩家从下往上迎敌，默认背面；敌人从上往下，默认正面
	last_facing = &"up" if unit["faction"] == "player" else &"down"
	_build_visual(unit)
	play_idle()
	set_hp_text(unit)


func _build_visual(unit: Dictionary) -> void:
	for child in get_children():
		child.queue_free()

	hp_bar_width = cell_size * 0.72

	var sprite_frames: SpriteFrames = UnitAnimLibrary.duplicate_for_instance(unit["def_id"])
	if sprite_frames != null and _has_idle_animation(sprite_frames):
		uses_sprite = true
		animated_sprite = AnimatedSprite2D.new()
		animated_sprite.sprite_frames = sprite_frames
		var fit: float = cell_size * 0.92 * UNIT_SCALE / SOURCE_FRAME_SIZE
		animated_sprite.scale = Vector2(fit, fit)
		animated_sprite.position = Vector2(0.0, cell_size * 0.02)
		if unit["faction"] == "enemy":
			animated_sprite.modulate = Color(1.0, 0.82, 0.82)
		add_child(animated_sprite)
	else:
		uses_sprite = false
		_add_fallback_body(unit)

	hp_overlay = Node2D.new()
	hp_overlay.z_index = 20
	hp_overlay.set_script(preload("res://scripts/ui/UnitHpOverlay.gd"))
	hp_overlay.unit_token = self
	add_child(hp_overlay)


func _sprite_display_size() -> float:
	return cell_size * 0.92 * UNIT_SCALE


func get_hp_bar_rect() -> Rect2:
	var bar_h: float = maxf(10.0, cell_size * 0.14)
	var bar_x: float = -hp_bar_width * 0.5
	var bar_y: float = -_sprite_display_size() * 0.55 - bar_h - 2.0
	return Rect2(bar_x, bar_y, hp_bar_width, bar_h)


func get_hp_bar_color() -> Color:
	if faction == "enemy":
		return Color(0.88, 0.28, 0.28)
	return Color(0.32, 0.78, 0.38)


func _add_fallback_body(unit: Dictionary) -> void:
	# 避免 Image.create()：微信 WASM 导出下该静态方法不可用，会导致脚本编译失败
	var body: Polygon2D = Polygon2D.new()
	var half: float = cell_size * 0.36
	var color: Color = GameState.unit_color(unit["def_id"]) if unit["faction"] == "player" else Color(0.75, 0.24, 0.24)
	body.color = color
	body.polygon = PackedVector2Array([
		Vector2(-half, -half),
		Vector2(half, -half),
		Vector2(half, half),
		Vector2(-half, half),
	])
	add_child(body)


func set_hp_text(unit: Dictionary) -> void:
	current_hp = max(0, int(unit["hp"]))
	max_hp = int(GameState.UNIT_DEFS.get(unit["def_id"], {}).get("max_hp", current_hp))
	if max_hp <= 0:
		max_hp = 1
	if hp_overlay != null:
		hp_overlay.queue_redraw()


func get_move_duration() -> float:
	if not uses_sprite or animated_sprite == null:
		return MIN_MOVE_DURATION
	return maxf(MIN_MOVE_DURATION, _animation_length(StringName(animated_sprite.animation)))


func play_walk(from_pos: Vector2i, to_pos: Vector2i) -> void:
	if not uses_sprite or animated_sprite == null:
		return

	var dx: int = to_pos.x - from_pos.x
	var dy: int = to_pos.y - from_pos.y
	var anim_name: StringName = _resolve_walk_animation(dx, dy)
	if not animated_sprite.sprite_frames.has_animation(anim_name):
		return

	_update_facing_from_delta(dx, dy)
	animated_sprite.flip_h = false
	animated_sprite.flip_v = false
	animated_sprite.set_frame_and_progress(0, 0.0)
	animated_sprite.play(anim_name)


func play_attack_toward(from_pos: Vector2i, target_pos: Vector2i) -> float:
	if not uses_sprite or animated_sprite == null:
		return MIN_MOVE_DURATION

	var dx: int = target_pos.x - from_pos.x
	var dy: int = target_pos.y - from_pos.y
	var anim_name: StringName = _resolve_attack_animation(dx, dy)
	if not animated_sprite.sprite_frames.has_animation(anim_name):
		anim_name = &"attack_right"
	if not animated_sprite.sprite_frames.has_animation(anim_name):
		return MIN_MOVE_DURATION

	_update_facing_from_delta(dx, dy)
	animated_sprite.flip_h = false
	animated_sprite.flip_v = false
	animated_sprite.set_frame_and_progress(0, 0.0)
	animated_sprite.play(anim_name)
	return _animation_length(anim_name)


func play_idle() -> void:
	if not uses_sprite or animated_sprite == null:
		return

	var anim_name: StringName = _resolve_idle_animation()
	if not animated_sprite.sprite_frames.has_animation(anim_name):
		return

	animated_sprite.flip_h = false
	animated_sprite.flip_v = false
	animated_sprite.play(anim_name)


func _has_idle_animation(sprite_frames: SpriteFrames) -> bool:
	return sprite_frames.has_animation(&"idle") or sprite_frames.has_animation(&"default")


func _resolve_idle_animation() -> StringName:
	# 只有朝上（背面）用 idle；其他方向用正面 default
	if last_facing == &"up":
		return &"idle"
	return &"default"


func _update_facing_from_delta(dx: int, dy: int) -> void:
	if dx == 0 and dy == 0:
		return
	if abs(dx) >= abs(dy):
		last_facing = &"left" if dx < 0 else &"right"
	elif dy < 0:
		last_facing = &"up"
	else:
		last_facing = &"down"


func _resolve_walk_animation(dx: int, dy: int) -> StringName:
	if dx == 0 and dy == 0:
		return &"idle"
	if abs(dx) >= abs(dy):
		return &"walk_left" if dx < 0 else &"walk_right"
	return &"walk_up" if dy < 0 else &"walk_down"


func _resolve_attack_animation(dx: int, dy: int) -> StringName:
	if abs(dx) >= abs(dy):
		return &"attack_left" if dx < 0 else &"attack_right"
	return &"attack_up" if dy < 0 else &"attack_down"


func _animation_length(anim_name: StringName) -> float:
	var sprite_frames: SpriteFrames = animated_sprite.sprite_frames
	if sprite_frames == null or not sprite_frames.has_animation(anim_name):
		return MIN_MOVE_DURATION

	var total_duration: float = 0.0
	for frame_idx in sprite_frames.get_frame_count(anim_name):
		total_duration += sprite_frames.get_frame_duration(anim_name, frame_idx)
	var speed: float = maxf(1.0, sprite_frames.get_animation_speed(anim_name))
	return total_duration / speed
