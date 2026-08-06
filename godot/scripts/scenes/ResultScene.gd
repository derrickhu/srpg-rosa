extends Control

signal retry_requested
signal restart_requested

@onready var title_label: Label = %TitleLabel
@onready var detail_label: Label = %DetailLabel
@onready var retry_button: Button = %RetryButton
@onready var restart_button: Button = %RestartButton

var winner: String = ""
var rounds: int = 0
var title_bitmap: BitmapText
var detail_bitmap: BitmapText

func setup(next_winner: String, next_rounds: int) -> void:
	winner = next_winner
	rounds = next_rounds
	if is_inside_tree():
		_refresh()


func _ready() -> void:
	print("[boot] ResultScene ready")
	title_bitmap = BitmapTextUtil.replace_label(title_label, "", 40, Color.WHITE)
	detail_bitmap = BitmapTextUtil.replace_label(detail_label, "", 20, Color.WHITE)
	BitmapTextUtil.overlay_button(retry_button, "返回布阵", 22, Color.WHITE)
	BitmapTextUtil.overlay_button(restart_button, "重置 Demo", 22, Color.WHITE)
	retry_button.pressed.connect(func() -> void:
		retry_requested.emit()
	)
	restart_button.pressed.connect(func() -> void:
		restart_requested.emit()
	)
	_refresh()


func _refresh() -> void:
	if title_label == null:
		return
	var win: bool = winner == "player"
	if title_bitmap != null:
		title_bitmap.text = "胜  利" if win else "失  败"
	if detail_bitmap != null:
		detail_bitmap.text = "回合数：%d  %s" % [
		rounds,
		"本 MVP 已跑通布阵、自动战斗和回放流程。" if win else "可以返回布阵调整站位后再试。",
	]
	title_label.text = ""
	detail_label.text = ""
	retry_button.text = ""
	restart_button.text = ""
