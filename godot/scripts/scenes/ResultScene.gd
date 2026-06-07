extends Control

signal retry_requested
signal restart_requested

@onready var title_label: Label = %TitleLabel
@onready var detail_label: Label = %DetailLabel
@onready var retry_button: Button = %RetryButton
@onready var restart_button: Button = %RestartButton

var winner: String = ""
var rounds: int = 0

func setup(next_winner: String, next_rounds: int) -> void:
	winner = next_winner
	rounds = next_rounds
	if is_inside_tree():
		_refresh()


func _ready() -> void:
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
	title_label.text = "胜  利" if win else "失  败"
	detail_label.text = "回合数：%d\n%s" % [
		rounds,
		"本 MVP 已跑通布阵、自动战斗和回放流程。" if win else "可以返回布阵调整站位后再试。",
	]
	retry_button.text = "返回布阵"
	restart_button.text = "重置 Demo"
