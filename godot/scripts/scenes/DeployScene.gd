extends Control

signal start_battle_requested
signal home_requested

@onready var root_box: Control = $RootBox
@onready var title_label: Label = %TitleLabel
@onready var info_label: Label = %InfoLabel
@onready var board_grid: GridContainer = %BoardGrid
@onready var roster_box: HBoxContainer = %RosterBox
@onready var start_button: Button = %StartBattleButton
@onready var home_button: Button = %HomeButton

const BOARD_GAP := 3
const SIDE_PADDING := 24.0
const RESERVED_VERTICAL := 300.0
const DEPLOY_CELL_SCENE := preload("res://scenes/DeployCell.tscn")

var selected_def_id: String = "sword"
var cell_nodes: Dictionary = {}


func _ready() -> void:
	_apply_safe_area()
	var stage: Dictionary = GameState.get_stage()
	title_label.text = stage["name"]
	start_button.pressed.connect(_on_start_pressed)
	home_button.pressed.connect(func() -> void:
		home_requested.emit()
	)
	_build_roster()
	_build_board()
	_refresh()


func _notification(what: int) -> void:
	if what != NOTIFICATION_RESIZED or not is_node_ready():
		return
	_apply_safe_area()
	if not cell_nodes.is_empty():
		_apply_board_cell_size()


func _apply_safe_area() -> void:
	var box: Control = root_box if root_box != null else get_node_or_null("RootBox") as Control
	if box == null:
		return
	SafeAreaInsets.apply_vertical_insets(box)


func _build_roster() -> void:
	for child in roster_box.get_children():
		child.queue_free()
	for def_id in GameState.ROSTER:
		var button: Button = Button.new()
		button.text = GameState.unit_label(def_id)
		button.custom_minimum_size = Vector2(120, 48)
		button.pressed.connect(_on_roster_pressed.bind(def_id))
		roster_box.add_child(button)


func _build_board() -> void:
	for child in board_grid.get_children():
		child.queue_free()
	cell_nodes.clear()

	var terrain: Array = GameState.get_stage()["terrain"]
	var width: int = terrain[0].size()
	var height: int = terrain.size()
	board_grid.columns = width
	board_grid.add_theme_constant_override("h_separation", BOARD_GAP)
	board_grid.add_theme_constant_override("v_separation", BOARD_GAP)

	for y in range(height):
		for x in range(width):
			var pos: Vector2i = Vector2i(x, y)
			var cell: Control = DEPLOY_CELL_SCENE.instantiate()
			cell.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
			cell.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			cell.cell_pressed.connect(_on_cell_pressed.bind(pos))
			board_grid.add_child(cell)
			cell_nodes[BattleTypes.key(pos)] = cell
	_apply_board_cell_size()


func _on_roster_pressed(def_id: String) -> void:
	selected_def_id = def_id
	_refresh()


func _on_cell_pressed(pos: Vector2i) -> void:
	var hint: String = ""
	if not GameState.placement_at(pos).is_empty():
		GameState.remove_placement_at(pos)
	elif not GameState.deploy_unit(selected_def_id, pos):
		hint = "只能在底部两行布阵，最多上阵 %d 人" % GameState.MAX_DEPLOY
	_refresh()
	if hint != "":
		_show_hint(hint)


func _on_start_pressed() -> void:
	if GameState.placements.is_empty():
		_show_hint("请至少部署 1 个单位")
		return
	start_battle_requested.emit()


func _refresh() -> void:
	var terrain: Array = GameState.get_stage()["terrain"]
	var rows: Vector2i = GameState.get_deploy_row_range()
	for y in range(terrain.size()):
		for x in range(terrain[y].size()):
			var pos: Vector2i = Vector2i(x, y)
			var cell = cell_nodes[BattleTypes.key(pos)]
			var placement: Dictionary = GameState.placement_at(pos)
			var terrain_id: String = terrain[y][x]
			var deployable: bool = y >= rows.x and y <= rows.y
			cell.apply_state(terrain_id, deployable, placement)

	info_label.text = "已选择：%s  上阵：%d/%d" % [
		GameState.unit_label(selected_def_id),
		GameState.placements.size(),
		GameState.MAX_DEPLOY,
	]


func _apply_board_cell_size() -> void:
	var terrain: Array = GameState.get_stage()["terrain"]
	var width: int = terrain[0].size()
	var height: int = terrain.size()
	var viewport: Vector2 = get_viewport_rect().size
	var usable_w: float = maxf(240.0, viewport.x - SIDE_PADDING * 2.0)
	var vertical_reserve: float = RESERVED_VERTICAL + SafeAreaInsets.top() + SafeAreaInsets.bottom()
	var usable_h: float = maxf(320.0, viewport.y - vertical_reserve)
	var gap_w: float = float(max(0, width - 1) * BOARD_GAP)
	var gap_h: float = float(max(0, height - 1) * BOARD_GAP)
	var by_width: float = (usable_w - gap_w) / float(width)
	var by_height: float = (usable_h - gap_h) / float(height)
	var cell: float = floorf(clampf(minf(by_width, by_height), 56.0, 112.0))
	for node in cell_nodes.values():
		node.setup_size(cell)


func _show_hint(message: String) -> void:
	info_label.text = message
