class_name SafeAreaInsets
extends RefCounted

# 微信小游戏常无法正确上报 safe area，用保守默认值避免顶栏/胶囊遮挡
const WEB_TOP_FALLBACK := 64.0
const WEB_BOTTOM_FALLBACK := 24.0


static func top() -> float:
	var safe: Rect2i = DisplayServer.get_display_safe_area()
	if safe.position.y > 0:
		return float(safe.position.y)
	if OS.has_feature("web"):
		return WEB_TOP_FALLBACK
	return 0.0


static func bottom() -> float:
	var safe: Rect2i = DisplayServer.get_display_safe_area()
	var screen_h: int = DisplayServer.screen_get_size().y
	var inset: float = float(screen_h - safe.end.y)
	if inset > 0:
		return inset
	if OS.has_feature("web"):
		return WEB_BOTTOM_FALLBACK
	return 0.0


static func apply_vertical_insets(control: Control, extra_top: float = 8.0, extra_bottom: float = 4.0) -> void:
	if control == null:
		return
	control.offset_top = top() + extra_top
	control.offset_bottom = -bottom() - extra_bottom
