class_name BitmapText
extends Control

@export var text: String = "":
	set(value):
		text = value
		queue_redraw()
		update_minimum_size()

@export var font_size: float = 28.0:
	set(value):
		font_size = value
		queue_redraw()
		update_minimum_size()

@export var font_color: Color = Color.WHITE:
	set(value):
		font_color = value
		queue_redraw()

@export var horizontal_alignment: HorizontalAlignment = HORIZONTAL_ALIGNMENT_CENTER:
	set(value):
		horizontal_alignment = value
		queue_redraw()

@export var vertical_alignment: VerticalAlignment = VERTICAL_ALIGNMENT_CENTER:
	set(value):
		vertical_alignment = value
		queue_redraw()

var atlas: Texture2D


func _ready() -> void:
	atlas = load(BitmapFontData.ATLAS_PATH) as Texture2D
	if atlas == null:
		print("[boot][bitmap] atlas load failed: ", BitmapFontData.ATLAS_PATH)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	queue_redraw()


func _get_minimum_size() -> Vector2:
	return Vector2(_measure_width(), font_size * 1.3)


func _draw() -> void:
	if atlas == null or text.is_empty():
		return

	var scale: float = font_size / BitmapFontData.BASE_SIZE
	var total_width: float = _measure_width()
	var x: float = 0.0
	match horizontal_alignment:
		HORIZONTAL_ALIGNMENT_CENTER:
			x = (size.x - total_width) * 0.5
		HORIZONTAL_ALIGNMENT_RIGHT:
			x = size.x - total_width

	var glyph_h: float = 80.0 * scale
	var y: float = 0.0
	match vertical_alignment:
		VERTICAL_ALIGNMENT_CENTER:
			y = (size.y - glyph_h) * 0.5
		VERTICAL_ALIGNMENT_BOTTOM:
			y = size.y - glyph_h

	for i in range(text.length()):
		var ch: String = text.substr(i, 1)
		var entry: Array = BitmapFontData.GLYPHS.get(ch, [])
		if entry.is_empty():
			x += font_size * 0.55
			continue
		var region: Rect2 = entry[0]
		var advance: float = float(entry[1]) * scale
		var rect := Rect2(Vector2(x, y), region.size * scale)
		draw_texture_rect_region(atlas, rect, region, font_color)
		x += advance


func _measure_width() -> float:
	var scale: float = font_size / BitmapFontData.BASE_SIZE
	var width: float = 0.0
	for i in range(text.length()):
		var ch: String = text.substr(i, 1)
		var entry: Array = BitmapFontData.GLYPHS.get(ch, [])
		if entry.is_empty():
			width += font_size * 0.55
		else:
			width += float(entry[1]) * scale
	return width
