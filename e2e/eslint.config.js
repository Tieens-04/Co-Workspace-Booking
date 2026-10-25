const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const globals = require('globals');

module.exports = [
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tsParser, globals: { ...globals.node, ...globals.browser } },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      'no-undef': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];
