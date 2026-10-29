const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Monorepo: Metro debe observar el workspace raíz y resolver módulos hoisted.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

// `expo-sqlite` para web importa su binario `.wasm`; Metro debe tratarlo como
// asset en lugar de intentar resolverlo como módulo. Solo afecta al bundle web.
config.resolver.assetExts.push('wasm');

module.exports = config;
