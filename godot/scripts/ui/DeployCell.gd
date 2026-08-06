extends Control

signal cell_pressed

@onready var terrain_image: TextureRect = %TerrainImage
@onready var deploy_highlight: ColorRect = %DeployHighlight
@onready var unit_label: Label = %UnitLabel
@onready var click_area: Button = %ClickArea

var unit_bitmap: BitmapText


func _ready() -> void:
	unit_label.text = ""
	unit_label.visible = false
	unit_bitmap = BitmapText.new()
	unit_bitmap.set_anchors_preset(Control.PRESET_FULL_RECT)
	unit_bitmap.font_size = 18
	unit_bitmap.font_color = Color.WHITE
	unit_bitmap.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	unit_bitmap.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	add_child(unit_bitmap)
	move_child(unit_bitmap, unit_label.get_index() + 1)
	click_area.pressed.connect(func() -> void:
		cell_pressed.emit()
	)


func setup_size(cell_size: float) -> void:
	custom_minimum_size = Vector2(cell_size, cell_size)


func apply_state(terrain_id: String, deployable: bool, placement: Dictionary) -> void:
	# 平原不叠贴图，露出 deploy_bg 底图；其他地形才显示对应格子图
	var show_terrain: bool = terrain_id != "plain"
	terrain_image.visible = show_terrain
	if show_terrain:
		terrain_image.texture = GameState.terrain_texture(terrain_id)

	var has_unit: bool = not placement.is_empty()
	if unit_bitmap != null:
		unit_bitmap.visible = has_unit
	if has_unit:
		unit_bitmap.text = GameState.unit_label(placement["def_id"])
		unit_bitmap.font_color = GameState.unit_color(placement["def_id"])
	else:
		if unit_bitmap != null:
			unit_bitmap.text = ""

	deploy_highlight.visible = deployable and not has_unit
	click_area.disabled = not deployable and not has_unit
