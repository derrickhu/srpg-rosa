'use strict'

const game = require('../config/game.json')

module.exports = {
  cloudbaseEnv: game.cloudbaseEnv,
  cloudbaseBucket: game.cloudbaseBucket,
  cloudbasePublicBaseUrl: game.cloudbasePublicBaseUrl,
  cloudbaseFilePrefix: game.cdnFilePrefix,
  cdnDirs: game.cdnDirs,
  bundledDirs: game.bundledDirs,
  ignoreFiles: game.ignoreFiles || ['.DS_Store', 'Thumbs.db'],
}
