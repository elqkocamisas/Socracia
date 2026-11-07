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

// Los proveedores falsos (`FakeLlmProvider`, `FailingLlmProvider`) existen para
// las pruebas y el desarrollo; no deben viajar en el bundle de producción. Se
// resuelven a un módulo vacío para que Metro no los incluya. Jest no lee esta
// configuración (usa su propio resolutor), así que las pruebas siguen usándolos.
const DEV_ONLY_PROVIDERS = /(?:^|\/)llm\/fakeProvider(?:\.js)?$/;
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (DEV_ONLY_PROVIDERS.test(moduleName)) {
    return { type: 'empty' };
  }
  return upstreamResolveRequest
    ? upstreamResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
