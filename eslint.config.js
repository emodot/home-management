import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
  globalIgnores([
    '**/dist',
    '**/coverage',
    '**/.turbo',
    '**/database.types.ts',
    // shadcn/ui components are generated and kept close to upstream.
    'apps/web/src/components/ui',
    // Deno edge functions are checked with `deno lint` / `deno check`.
    'supabase/functions',
  ]),

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
    },
  },

  // Plain JS config files are outside any tsconfig.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // Web app (browser + React).
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
  // React Router loaders throw redirect() Responses.
  {
    files: ['apps/web/src/routes/loaders.ts'],
    rules: {
      '@typescript-eslint/only-throw-error': [
        'error',
        { allow: [{ from: 'lib', name: 'Response' }] },
      ],
    },
  },

  // packages/shared must stay platform-agnostic (shared with the future React Native app).
  {
    files: ['packages/shared/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'packages/shared must not use DOM APIs.' },
        { name: 'document', message: 'packages/shared must not use DOM APIs.' },
        { name: 'localStorage', message: 'packages/shared must not use DOM APIs.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.type='MetaProperty'][property.name='env']",
          message: 'packages/shared must not use import.meta.env (Vite-only).',
        },
      ],
    },
  },
)
