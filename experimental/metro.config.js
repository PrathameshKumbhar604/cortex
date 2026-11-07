// Lets the app import the web app's shared types and pure helpers (packages/shared) without making it a workspace.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const shared = path.resolve(__dirname, "../packages/shared");

config.watchFolders = [shared];
config.resolver.extraNodeModules = { "@cortex/shared": path.join(shared, "src") };
// packages/shared imports zod; resolve it (and everything else) from this app's node_modules only.
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
