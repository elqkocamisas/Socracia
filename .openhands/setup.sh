#!/usr/bin/env bash
#
# Socracia — bootstrap del entorno de desarrollo.
#
# Idempotente: puede ejecutarse varias veces sin efectos adversos.
# Instala dependencias del monorepo, compila todos los workspaces y verifica la
# suite de pruebas.

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Socracia setup: $ROOT_DIR"

echo "==> Comprobando versiones de Node y npm"
node --version
npm --version

echo "==> Instalando dependencias del monorepo (npm workspaces)"
# --no-audit/--no-fund mantienen la salida limpia en CI.
npm install --no-audit --no-fund

echo "==> Compilando los workspaces (el postinstall ya lo intenta; se asegura aquí)"
npm run build

echo "==> Ejecutando lint"
npm run lint || echo "WARN: lint reportó problemas (revisar antes de commitear)"

echo "==> Ejecutando typecheck"
npm run typecheck || echo "WARN: typecheck reportó problemas"

echo "==> Ejecutando pruebas"
npm test

echo "==> Setup completado."
echo "    App móvil:  npm run start  (o: npm run android / npm run ios)"
echo "    Backend:    npm start --workspace @socracia/api  (por defecto :8787)"
echo "    Verificar:  npm run verify"
