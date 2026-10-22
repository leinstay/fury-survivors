// ESLint (flat config): практичное подмножество Google JavaScript Style Guide.
import globals from 'globals';

const rules = {
  'no-var': 'error',
  'prefer-const': 'error',
  'eqeqeq': ['error', 'always', { null: 'ignore' }],
  'semi': 'error',
  'quotes': ['error', 'single', { avoidEscape: true }],
  'no-trailing-spaces': 'error',
  'one-var': ['error', 'never'],
  'curly': ['error', 'multi-line'],
  'max-len': ['error', {
    code: 100,
    ignoreComments: true,
    ignoreStrings: true,
    ignoreTemplateLiterals: true,
    ignoreUrls: true,
    ignoreRegExpLiterals: true,
  }],
  'no-restricted-syntax': ['error', {
    selector: 'ExportDefaultDeclaration',
    message: 'Только именованные экспорты.',
  }],
};

// ESLint и Playwright требуют экспорт по умолчанию в конфиге, поэтому *.config.js исключены
// из правила именованных экспортов.
export default [
  {
    ignores: ['vendor/**', 'node_modules/**', 'tools/out/**', 'assets/**', 'references/**',
      'test-results/**', 'playwright-report/**'],
  },
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, Phaser: 'readonly' },
    },
    rules,
  },
  {
    files: ['tests/**/*.js', 'tools/**/*.mjs', '*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules,
  },
  {
    files: ['*.config.js'],
    rules: { 'no-restricted-syntax': 'off' },
  },
];
