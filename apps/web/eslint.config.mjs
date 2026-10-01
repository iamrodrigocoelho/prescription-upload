import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Versão explícita: a detecção automática do eslint-plugin-react usa uma API
    // removida no ESLint 10 (context.getFilename).
    settings: { react: { version: '19.3' } },
    rules: {
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'public/**', 'next-env.d.ts']),
]);
