/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/*.test.tsx', '**/*.test.ts'],
  // El primer render de un fichero de interfaz puede superar los 5 s por defecto
  // en un runner de CI compartido: la suite se volvía intermitente. 20 s deja
  // margen de sobra sin ocultar un cuelgue real.
  testTimeout: 20000,
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@socracia/.*))',
  ],
};
