// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

/**
 * Size budgets of the clean-code gate: a unit over them mixes responsibilities.
 * Files stay a hard error. The function budgets are warnings under a ratchet
 * (`--max-warnings` in `npm run lint`): the existing overruns are recorded debt,
 * a new one fails the build.
 */
const budgets = {
  'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': ['warn', { max: 40, skipBlankLines: true, skipComments: true }],
  complexity: ['warn', 10],
  'max-depth': ['warn', 3],
  'max-params': ['warn', 4],
};

module.exports = tseslint.config(
  { ignores: ['dist/**', '**/_generated/**', 'compat/**', 'e2e/**', 'node_modules/**', '.angular/**'] },
  {
    files: ['projects/**/*.ts'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended, ...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: __dirname } },
    rules: {
      ...budgets,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
      'no-restricted-syntax': [
        'error',
        { selector: 'TSAsExpression > TSNeverKeyword', message: '`as never` hides the call from the compiler: type the reference instead.' },
      ],
    },
  },
  {
    // The secondary entry points have no tsconfig of their own: one covers the whole library.
    files: ['projects/ngx-convex/**/*.ts'],
    languageOptions: { parserOptions: { projectService: false, project: ['projects/ngx-convex/tsconfig.eslint.json'], tsconfigRootDir: __dirname } },
  },
  {
    // Tests read as scenarios: long bodies are the arrange/act/assert of one case.
    files: ['**/*.spec.ts', '**/test/**/*.ts'],
    rules: { 'max-lines-per-function': 'off', 'max-lines': 'off', '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    files: ['projects/**/*.html'],
    extends: [...angular.configs.templateRecommended],
  },
);
