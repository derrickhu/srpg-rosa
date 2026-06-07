extends Control

signal playback_finished(winner: String, rounds: int)

@onready var status_label: Label = %StatusLabel
@onready var board_layer: Node2D = %BoardLayer
@onready var fx_layer: CanvasLayer = %FxLayer

var report: Dictionary = {}
var initial_units: Array[Dictionary] = []
var terrain: Array = []
var token_by_uid: Dictionary = {}
var unit_state_by_uid: Dictionary = {}
var cell_size: float = 72.0
var board_origin: Vector2 = Vector2.ZERO
var is_started: bool = false

const SIDE_PADDING := 18.0
const TOP_RESERVED := 92.0
const BOTTOM_RESERVED := 36.0
const CELL_GAP := 3.0
const UNIT_TOKEN_SCENE := preload("res://scenes/UnitToken.tscn")

func setup(next_report: Dictionary, next_units: Array[Dictionary], next_terrain: Array) -> void:
	report = next_report
	initial_units = next_units
	terrain = next_terrain
	is_started = false
	if is_inside_tree():
		_build_and_start()


func _ready() -> void:
	if not report.is_empty():
		_build_and_start()


func _build_and_start() -> void:
	if is_started:
		return
	is_started = true
	_apply_safe_area()
	_calculate_board_layout()
	_draw_board()
	_spawn_units()
	call_deferred("_play_report")


func _apply_safe_area() -> void:
	if status_label == null:
		return
	var inset_top: float = SafeAreaInsets.top()
	status_label.offset_top = inset_top + 24.0
	status_label.offset_bottom = inset_top + 72.0


func _calculate_board_layout() -> void:
	var viewport: Vector2 = get_viewport_rect().size
	var width: int = terrain[0].size()
	var height: int = terrain.size()
	var top_reserved: float = TOP_RESERVED + SafeAreaInsets.top()
	var bottom_reserved: float = BOTTOM_RESERVED + SafeAreaInsets.bottom()
	var usable_w: float = maxf(240.0, viewport.x - SIDE_PADDING * 2.0)
	var usable_h: float = maxf(320.0, viewport.y - top_reserved - bottom_reserved)
	var gap_w: float = float(max(0, width - 1)) * CELL_GAP
	var gap_h: float = float(max(0, height - 1)) * CELL_GAP
	cell_size = clampf(floorf(minf((usable_w - gap_w) / float(width), (usable_h - gap_h) / float(height))), 56.0, 116.0)
	var board_w: float = cell_size * float(width) + gap_w
	var board_h: float = cell_size * float(height) + gap_h
	board_origin = Vector2(
		floorf((viewport.x - board_w) / 2.0),
		top_reserved + floorf((usable_h - board_h) / 2.0)
	)


func _draw_board() -> void:
	for child in board_layer.get_children():
		child.queue_free()
	token_by_uid.clear()
	unit_state_by_uid.clear()

	for y in range(terrain.size()):
		for x in range(terrain[y].size()):
			var terrain_id: String = terrain[y][x]
			var cell_origin: Vector2 = board_origin + Vector2(
				x * (cell_size + CELL_GAP),
				y * (cell_size + CELL_GAP)
			)
			_add_terrain_cell(cell_origin, terrain_id)


func _add_terrain_cell(cell_origin: Vector2, terrain_id: String) -> void:
	# 与排阵 DeployCell 一致：平原不叠贴图，露出背景；其他地形显示对应贴图
	if terrain_id == "plain":
		return

	var texture: Texture2D = GameState.terrain_texture(terrain_id)
	if texture == null:
		return

	var cell_root: Node2D = Node2D.new()
	cell_root.position = cell_origin
	board_layer.add_child(cell_root)

	var sprite: Sprite2D = Sprite2D.new()
	sprite.texture = texture
	sprite.centered = false
	var tex_size: Vector2 = texture.get_size()
	var fit: float = cell_size / maxf(tex_size.x, tex_size.y)
	sprite.scale = Vector2(fit, fit)
	sprite.position = Vector2(
		(cell_size - tex_size.x * fit) * 0.5,
		(cell_size - tex_size.y * fit) * 0.5
	)
	cell_root.add_child(sprite)


func _spawn_units() -> void:
	for unit in initial_units:
		var token: UnitToken = _create_unit_token(unit)
		token.position = _cell_center(unit["pos"])
		board_layer.add_child(token)
		token_by_uid[unit["uid"]] = token
		unit_state_by_uid[unit["uid"]] = unit.duplicate(true)


func _create_unit_token(unit: Dictionary) -> UnitToken:
	var token: UnitToken = UNIT_TOKEN_SCENE.instantiate()
	token.z_index = 10
	token.setup(unit, cell_size)
	return token


func _cell_center(pos: Vector2i) -> Vector2:
	return board_origin + Vector2(
		pos.x * (cell_size + CELL_GAP) + cell_size * 0.5,
		pos.y * (cell_size + CELL_GAP) + cell_size * 0.5
	)


func _play_report() -> void:
	for event in report["events"]:
		match event["type"]:
			"round":
				status_label.text = "第 %d 回合" % event["round"]
				await get_tree().create_timer(0.35).timeout
			"moveRange":
				await get_tree().create_timer(0.08).timeout
			"moveStep":
				await _play_move_step(event)
			"attack":
				await _play_attack(event)
			"death":
				await _play_death(event)
			"end":
				var winner: String = event["winner"]
				status_label.text = "战斗结束：%s胜利" % ("玩家" if winner == "player" else "敌人")
				await get_tree().create_timer(0.8).timeout
				playback_finished.emit(winner, int(report["rounds"]))
				return


func _play_move_step(event: Dictionary) -> void:
	var uid: String = event["uid"]
	if not token_by_uid.has(uid):
		return
	var token: UnitToken = token_by_uid[uid]
	var from_pos: Vector2i = event.get("from", unit_state_by_uid.get(uid, {}).get("pos", event["to"]))
	var to_pos: Vector2i = event["to"]
	token.play_walk(from_pos, to_pos)
	var move_duration: float = token.get_move_duration()
	var tween: Tween = create_tween()
	tween.tween_property(token, "position", _cell_center(to_pos), move_duration)
	await tween.finished
	token.play_idle()
	if unit_state_by_uid.has(uid):
		unit_state_by_uid[uid]["pos"] = to_pos


func _play_attack(event: Dictionary) -> void:
	var attacker_uid: String = event["attacker"]
	var target_uid: String = event["target"]
	status_label.text = "%s 对 %s 造成 %d 伤害" % [
		_display_name(attacker_uid),
		_display_name(target_uid),
		event["damage"],
	]
	var hit_applied: bool = false
	if token_by_uid.has(attacker_uid) and unit_state_by_uid.has(attacker_uid) and unit_state_by_uid.has(target_uid):
		var attacker: UnitToken = token_by_uid[attacker_uid]
		var from_pos: Vector2i = unit_state_by_uid[attacker_uid]["pos"]
		var target_pos: Vector2i = unit_state_by_uid[target_uid]["pos"]
		var attack_duration: float = attacker.play_attack_toward(from_pos, target_pos)
		var hit_time: float = attack_duration * 0.55
		await get_tree().create_timer(hit_time).timeout
		if token_by_uid.has(target_uid):
			var target: UnitToken = token_by_uid[target_uid]
			var hit_pos: Vector2 = target.position
			VfxLibrary.spawn_slash_hit(board_layer, hit_pos, from_pos, target_pos)
			_flash_hit(target)
			_show_damage_popup(target, int(event["damage"]))
			if unit_state_by_uid.has(target_uid):
				unit_state_by_uid[target_uid]["hp"] = event["hpLeft"]
				_set_token_text(target, unit_state_by_uid[target_uid])
			hit_applied = true
		var remain: float = maxf(0.0, attack_duration - hit_time)
		if remain > 0.0:
			await get_tree().create_timer(remain).timeout
		attacker.play_idle()
	if not hit_applied and token_by_uid.has(target_uid):
		_show_damage_popup(token_by_uid[target_uid], int(event["damage"]))
		if unit_state_by_uid.has(target_uid):
			unit_state_by_uid[target_uid]["hp"] = event["hpLeft"]
			_set_token_text(token_by_uid[target_uid], unit_state_by_uid[target_uid])
	await get_tree().create_timer(0.25).timeout


func _flash_hit(token: Node2D) -> void:
	var original: Color = token.modulate
	token.modulate = Color(1.8, 1.8, 1.8, 1.0)
	var tween: Tween = create_tween()
	tween.tween_property(token, "modulate", original, 0.12)


func _play_death(event: Dictionary) -> void:
	var uid: String = event["uid"]
	if not token_by_uid.has(uid):
		return
	status_label.text = "%s 被击败" % _display_name(uid)
	var token: Node2D = token_by_uid[uid]
	var tween: Tween = create_tween()
	tween.tween_property(token, "modulate:a", 0.0, 0.2)
	await tween.finished
	token.visible = false


func _set_token_text(token: Node2D, unit: Dictionary) -> void:
	if token is UnitToken:
		(token as UnitToken).set_hp_text(unit)


func _display_name(uid: String) -> String:
	if unit_state_by_uid.has(uid):
		return GameState.unit_label(unit_state_by_uid[uid]["def_id"])
	return uid


func _show_damage_popup(token: Node2D, damage: int) -> void:
	if damage <= 0:
		return

	var label: Label = Label.new()
	label.text = "-%d" % damage
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.custom_minimum_size = Vector2(80, 36)
	label.add_theme_font_size_override("font_size", 24)
	label.add_theme_color_override("font_color", Color(1.0, 0.35, 0.3))
	label.add_theme_color_override("font_outline_color", Color(0.12, 0.04, 0.04))
	label.add_theme_constant_override("outline_size", 4)
	fx_layer.add_child(label)

	var start_pos: Vector2 = token.global_position + Vector2(-40.0, -_damage_popup_offset_y(token))
	label.position = start_pos

	var tween: Tween = create_tween()
	tween.tween_property(label, "position", start_pos + Vector2(0.0, -48.0), 0.55)
	tween.parallel().tween_property(label, "modulate:a", 0.0, 0.55)
	tween.tween_callback(label.queue_free)


func _damage_popup_offset_y(token: Node2D) -> float:
	if token is UnitToken:
		var unit_token: UnitToken = token as UnitToken
		return unit_token.get_hp_bar_rect().position.y - 8.0
	return cell_size * 0.8
