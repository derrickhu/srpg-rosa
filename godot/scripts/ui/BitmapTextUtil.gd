class_name BitmapTextUtil
extends RefCounted


static func replace_label(label: Label, value: String, size: float, color: Color = Color.WHITE) -> BitmapText:
	var parent := label.get_parent()
	var index := label.get_index()
	label.text = ""
	label.visible = false

	var bitmap := BitmapText.new()
	bitmap.text = value
	bitmap.font_size = size
	bitmap.font_color = color
	bitmap.horizontal_alignment = label.horizontal_alignment
	bitmap.vertical_alignment = label.vertical_alignment
	bitmap.size_flags_horizontal = label.size_flags_horizontal
	bitmap.size_flags_vertical = label.size_flags_vertical
	bitmap.custom_minimum_size = label.custom_minimum_size
	parent.add_child(bitmap)
	parent.move_child(bitmap, index)
	return bitmap


static func overlay_button(button: Button, value: String, size: float, color: Color = Color.WHITE) -> BitmapText:
	button.text = ""
	for child in button.get_children():
		if child is Label:
			(child as Label).text = ""
			child.visible = false

	var bitmap := BitmapText.new()
	bitmap.text = value
	bitmap.font_size = size
	bitmap.font_color = color
	bitmap.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	bitmap.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	bitmap.set_anchors_preset(Control.PRESET_FULL_RECT)
	button.add_child(bitmap)
	return bitmap
