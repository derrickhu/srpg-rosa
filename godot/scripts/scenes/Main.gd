extends Control

var current_scene = null
var last_units = []
var last_terrain = []
var scene_root = null
var game_state = null
var battle_runner = null

func _ready():
	print("[boot] Main ready")
	scene_root = get_node("SceneRoot")
	game_state = get_node("/root/GameState")
	battle_runner = load("res://scripts/battle/BattleRunner.gd")
	game_state.reset_run()
	show_home()


func show_home():
	print("[boot] show_home")
	var scene = _switch_to("res://scenes/HomeScene.tscn")
	scene.connect("start_requested", show_deploy)


func show_deploy():
	print("[boot] show_deploy")
	var scene = _switch_to("res://scenes/DeployScene.tscn")
	scene.connect("start_battle_requested", _on_start_battle_requested)
	scene.connect("home_requested", show_home)


func show_result(winner, rounds):
	print("[boot] show_result")
	var scene = _switch_to("res://scenes/ResultScene.tscn")
	scene.call("setup", winner, rounds)
	scene.connect("retry_requested", show_deploy)
	scene.connect("restart_requested", _on_restart_requested)


func _on_start_battle_requested():
	last_units = game_state.build_battle_units()
	last_terrain = game_state.get_stage()["terrain"]
	var report = battle_runner.run_battle(last_units, last_terrain, game_state.UNIT_DEFS, game_state.get_stage()["ai_difficulty"])
	game_state.last_winner = report["winner"]
	game_state.last_rounds = report["rounds"]

	var scene = _switch_to("res://scenes/BattlePlaybackScene.tscn")
	scene.call("setup", report, last_units, last_terrain)
	scene.connect("playback_finished", show_result)


func _on_restart_requested():
	game_state.reset_run()
	show_deploy()


func _switch_to(scene_path):
	print("[boot] switch_to ", scene_path)
	if current_scene != null:
		current_scene.queue_free()
		current_scene = null
	var packed = load(scene_path)
	if packed == null:
		push_error("Scene load failed: " + scene_path)
		return null
	current_scene = packed.instantiate()
	scene_root.add_child(current_scene)
	return current_scene
