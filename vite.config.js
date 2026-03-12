const fs = require('fs/promises');
const path = require('path');
const { defineConfig } = require('vite');

const ROOT_DIR = __dirname;
const SRC_DIR = path.resolve(ROOT_DIR, 'src');
const PUBLIC_DIR = path.resolve(SRC_DIR, 'public');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');

async function copyDirectory(sourceDir, targetDir) {
  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      const sourcePath = path.join(sourceDir, entry.name);
      const targetPath = path.join(targetDir, entry.name);

      if (entry.isDirectory()) {
        await copyDirectory(sourcePath, targetPath);
        return;
      }

      await fs.copyFile(sourcePath, targetPath);
    })
  );
}

async function prepareDist() {
  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await fs.mkdir(DIST_DIR, { recursive: true });
  await copyDirectory(PUBLIC_DIR, DIST_DIR);
}

async function copyPublicAssets() {
  await fs.mkdir(DIST_DIR, { recursive: true });
  await copyDirectory(PUBLIC_DIR, DIST_DIR);
}

function createExtensionBuildConfig(watch = false) {
  return defineConfig({
    publicDir: false,
    build: {
      outDir: DIST_DIR,
      emptyOutDir: false,
      minify: false,
      watch: watch ? {} : undefined,
      rollupOptions: {
        input: {
          background: path.resolve(SRC_DIR, 'background/index.js'),
          popup: path.resolve(SRC_DIR, 'popup/index.js')
        },
        output: {
          format: 'es',
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name].js',
          assetFileNames: 'assets/[name][extname]'
        }
      }
    }
  });
}

function createContentScriptBuildConfig(watch = false) {
  return defineConfig({
    publicDir: false,
    build: {
      outDir: DIST_DIR,
      emptyOutDir: false,
      minify: false,
      watch: watch ? {} : undefined,
      rollupOptions: {
        input: path.resolve(SRC_DIR, 'overlay/index.js'),
        output: {
          entryFileNames: 'content-script.js',
          extend: false,
          format: 'iife',
          inlineDynamicImports: true,
          name: 'BbrushContentScript'
        }
      }
    }
  });
}

module.exports = defineConfig(createExtensionBuildConfig());
module.exports.DIST_DIR = DIST_DIR;
module.exports.PUBLIC_DIR = PUBLIC_DIR;
module.exports.copyPublicAssets = copyPublicAssets;
module.exports.createContentScriptBuildConfig = createContentScriptBuildConfig;
module.exports.createExtensionBuildConfig = createExtensionBuildConfig;
module.exports.prepareDist = prepareDist;
