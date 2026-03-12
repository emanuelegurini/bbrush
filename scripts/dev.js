const fs = require('fs');
const { build } = require('vite');
const {
  copyPublicAssets,
  createContentScriptBuildConfig,
  createExtensionBuildConfig,
  prepareDist,
  PUBLIC_DIR
} = require('../vite.config.js');

function startPublicWatcher() {
  const watcher = fs.watch(PUBLIC_DIR, { recursive: true }, () => {
    copyPublicAssets().catch((error) => {
      console.error('[bbrush] Failed to copy public assets.', error);
    });
  });

  return watcher;
}

async function runDev() {
  await prepareDist();

  const extensionWatcher = await build(createExtensionBuildConfig(true));
  const contentScriptWatcher = await build(createContentScriptBuildConfig(true));
  const publicWatcher = startPublicWatcher();

  const cleanup = () => {
    if (extensionWatcher && typeof extensionWatcher.close === 'function') {
      extensionWatcher.close();
    }

    if (contentScriptWatcher && typeof contentScriptWatcher.close === 'function') {
      contentScriptWatcher.close();
    }

    if (publicWatcher && typeof publicWatcher.close === 'function') {
      publicWatcher.close();
    }
  };

  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });
}

runDev().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
