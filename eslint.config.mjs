import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    // Ignore generated and dependency directories for all rules.
    // The client/ directory has its own ESLint/Prettier setup.
    ignores: ['node_modules/**', 'dist/**', 'coverage/**', '*.mjs', 'client/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettierConfig,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    },
  },
  {
    // Relax rules that produce false positives in test files.
    files: ['**/*.test.ts'],
    rules: {
      // vi.fn() mocks are accessed via expect(...) which triggers unbound-method
      // but is safe and idiomatic in Vitest.
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);

