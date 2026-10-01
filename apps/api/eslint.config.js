import { node } from '@receita/config/eslint/node';
import { defineConfig } from 'eslint/config';

export default defineConfig(
  node,
  {
    rules: {
      // Com emitDecoratorMetadata, `import type` em classes injetadas quebra a DI do Nest.
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
  {
    // Corpos de resposta do supertest são `any` por natureza.
    files: ['test/**/*.ts', 'src/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
);
