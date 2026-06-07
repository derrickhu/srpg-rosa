class_name UnitAnimLibrary
extends RefCounted

const SWORD_FRAMES_PATH := "res://art/units/sword/sword_frames.tres"


static func has_animations(def_id: String) -> bool:
	return get_sprite_frames(def_id) != null


static func get_sprite_frames(def_id: String) -> SpriteFrames:
	var path: String = _frames_path(def_id)
	if path.is_empty():
		return null

	# 运行时 load，编辑器里改 sword_frames.tres 后重新运行即可生效
	var frames: SpriteFrames = load(path) as SpriteFrames
	if frames == null:
		return null

	var names: PackedStringArray = frames.get_animation_names()
	for anim_name in names:
		if anim_name != "default" and frames.get_frame_count(anim_name) > 0:
			return frames

	return null


static func duplicate_for_instance(def_id: String) -> SpriteFrames:
	var frames: SpriteFrames = get_sprite_frames(def_id)
	if frames == null:
		return null
	# 每个单位各用一份，避免多角色共用同一资源时动画状态串台
	return frames.duplicate(true)


static func _frames_path(def_id: String) -> String:
	match def_id:
		"sword":
			return SWORD_FRAMES_PATH
		_:
			return ""
