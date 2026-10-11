const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Windows NodeWatcher must not crawl every unrelated app, document or evidence tree.
// The mobile import inventory uses workspace lib/ and packages/; dependencies retain both roots.
if (process.platform === "win32") {
  config.watchFolders = [projectRoot, ...["lib", "packages", "node_modules"].map(folder => path.join(workspaceRoot, folder))];
  // Installed Metro supports lazy SHA1: hash modules/assets when used instead of every file at startup.
  config.watcher = { ...config.watcher, unstable_lazySha1: true };
} else {
  config.watchFolders = Array.from(new Set([...(config.watchFolders ?? []), workspaceRoot]));
}
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules")
];
config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, "node_modules/react"),
  "react/jsx-runtime": path.resolve(projectRoot, "node_modules/react/jsx-runtime.js"),
  "react/jsx-dev-runtime": path.resolve(projectRoot, "node_modules/react/jsx-dev-runtime.js"),
  "react-dom": path.resolve(projectRoot, "node_modules/react-dom"),
  "react-dom/client": path.resolve(projectRoot, "node_modules/react-dom/client.js"),
  "react-native-web": path.resolve(projectRoot, "node_modules/react-native-web")
};

module.exports = config;
