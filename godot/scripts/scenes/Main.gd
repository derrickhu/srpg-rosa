extends Control

@onready var scene_root: Control = $SceneRoot

var current_scene: Node = null
var last_units: Array[Dictionary] = []
var last_terrain: Array = []

func _ready() -> void:
	GameState.reset_run()
	show_home()


func show_home() -> void:
	var scene = _switch_to("res://scenes/HomeScene.tscn")
	scene.start_requested.connect(show_deploy)


func show_deploy() -> void:
	var scene = _switch_to("res://scenes/DeployScene.tscn")
	scene.start_battle_requested.connect(_on_start_battle_requested)
	scene.home_requested.connect(show_home)


func show_result(winner: String, rounds: int) -> void:
	var scene = _switch_to("res://scenes/ResultScene.tscn")
	scene.setup(winner, rounds)
	scene.retry_requested.connect(show_deploy)
	scene.restart_requested.connect(_on_restart_requested)


func _on_start_battle_requested() -> void:
	last_units = GameState.build_battle_units()
	last_terrain = GameState.get_stage()["terrain"]
	var report: Dictionary = BattleRunner.run_battle(last_units, last_terrain, GameState.UNIT_DEFS, GameState.get_stage()["ai_difficulty"])
	GameState.last_winner = report["winner"]
	GameState.last_rounds = report["rounds"]

	var scene = _switch_to("res://scenes/BattlePlaybackScene.tscn")
	scene.setup(report, last_units, last_terrain)
	scene.playback_finished.connect(show_result)


func _on_restart_requested() -> void:
	GameState.reset_run()
	show_deploy()


func _switch_to(scene_path: String):
	if current_scene != null:
		current_scene.queue_free()
		current_scene = null
	var packed: PackedScene = load(scene_path)
	current_scene = packed.instantiate()
	scene_root.add_child(current_scene)
	return current_scene
