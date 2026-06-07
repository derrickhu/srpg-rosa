extends Control

signal start_requested

@onready var start_button: Button = %StartButton

func _ready() -> void:
	start_button.pressed.connect(func() -> void:
		start_requested.emit()
	)
