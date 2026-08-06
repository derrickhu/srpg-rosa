import './godot-sdk'
import './godot'

const EXE = '/engine/godot'
const PACK = '/engine/demo-pck-untyped-main.bin'

console.log('[boot] engine entry: bitmap-font untyped-main')
GODOTSDK.startGame(EXE, PACK)
