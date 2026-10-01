import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

/**
 * Regras compartilhadas por todo o monorepo.
 * `no-console` é erro: logs passam pelo logger estruturado (com redaction de PII).
 */
export const base = defineConfig(
  { ignores: ['**/dist/**', '**/.next/**', '**/coverage/**', '**/generated/**', '**/*.config.*'] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true },
    },
    rules: {
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  prettier,
);

export default base;
