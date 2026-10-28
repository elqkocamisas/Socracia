import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.expo/**',
      '**/android/**',
      '**/ios/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Archivos de configuración CommonJS (Babel, Jest, Metro).
    files: ['**/*.config.js', '**/babel.config.js', '**/metro.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Scripts de Node (generación de assets, tareas de build).
    files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    // Librerías CommonJS de los scripts: se cargan con `require` desde el CLI
    // ESM y desde las pruebas, así que no pueden ser módulos ESM.
    files: ['scripts/**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
