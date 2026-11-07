// Lets the app import the web app's shared types and pure helpers (packages/shared) without making it a workspace.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const shared = path.resolve(__dirname, "../packages/shared");

config.watchFolders = [shared];
config.resolver.extraNodeModules = { "@cortex/shared": path.join(shared, "src") };
// Anything packages/shared imports resolves from this app's node_modules first.
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];

module.exports = config;
