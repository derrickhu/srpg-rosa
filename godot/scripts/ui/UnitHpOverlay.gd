extends Node2D

var unit_token: UnitToken


func _draw() -> void:
	if unit_token == null:
		return

	var bar_rect: Rect2 = unit_token.get_hp_bar_rect()
	var ratio: float = clampf(float(unit_token.current_hp) / float(unit_token.max_hp), 0.0, 1.0)

	draw_rect(bar_rect, Color(0.08, 0.1, 0.12, 0.92), true)
	if ratio > 0.0:
		var fill_rect: Rect2 = Rect2(
			bar_rect.position.x,
			bar_rect.position.y,
			bar_rect.size.x * ratio,
			bar_rect.size.y
		)
		draw_rect(fill_rect, unit_token.get_hp_bar_color(), true)
	draw_rect(bar_rect, Color(0.95, 0.9, 0.7, 0.9), false, 1.5)

	var hp_text: String = str(unit_token.current_hp)
	if not unit_token.uses_sprite:
		hp_text = "%s %d" % [GameState.unit_label(unit_token.def_id), unit_token.current_hp]

	var font: Font = ThemeDB.fallback_font
	if font == null:
		return
	var font_size: int = maxi(12, int(bar_rect.size.y * 1.0))
	var text_y: float = bar_rect.position.y + bar_rect.size.y * 0.5 + font_size * 0.35
	draw_string(
		font,
		Vector2(bar_rect.position.x, text_y),
		hp_text,
		HORIZONTAL_ALIGNMENT_CENTER,
		bar_rect.size.x,
		font_size,
		Color(1.0, 0.98, 0.9)
	)
