const { build } = require('vite');
const {
  createContentScriptBuildConfig,
  createExtensionBuildConfig,
  prepareDist
} = require('../vite.config.js');

async function runBuild() {
  await prepareDist();
  await build(createExtensionBuildConfig(false));
  await build(createContentScriptBuildConfig(false));
}

runBuild().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
