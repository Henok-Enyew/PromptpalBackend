import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      // The existing codebase leans on `any` and unused handler params heavily;
      // keep these visible as warnings while they are cleaned up incrementally.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-empty-object-type': 'off',
      // Only hit in utils/gemini.util.ts and the optimizer service, both
      // replaced in Phase 1 (services/llm). Restore to 'error' afterwards.
      'preserve-caught-error': 'warn',
      'no-useless-assignment': 'warn',
      '@typescript-eslint/no-namespace': 'off',
    },
  },
);
