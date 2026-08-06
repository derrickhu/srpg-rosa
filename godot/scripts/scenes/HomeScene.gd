extends Control

signal start_requested

@onready var start_button: Button = %StartButton

func _ready() -> void:
	print("[boot] HomeScene ready")
	BitmapTextUtil.replace_label($CenterBox/TitleLabel, "无尽纹章", 44, Color(1.0, 1.0, 1.0))
	BitmapTextUtil.replace_label($CenterBox/SubtitleLabel, "Godot 迁移 MVP", 22, Color(1.0, 1.0, 1.0))
	BitmapTextUtil.overlay_button(start_button, "开始 Demo", 24, Color(1.0, 1.0, 1.0))
	start_button.pressed.connect(func() -> void:
		start_requested.emit()
	)
