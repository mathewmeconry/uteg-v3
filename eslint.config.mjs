import { fileURLToPath } from 'node:url';
import globals from 'globals';
import pluginJs from '@eslint/js';
import { fixupPluginRules, includeIgnoreFile } from '@eslint/compat';
import tseslint from 'typescript-eslint';
import pluginReact from 'eslint-plugin-react';
import pluginJsxA11y from 'eslint-plugin-jsx-a11y';
import pluginReactHooks from 'eslint-plugin-react-hooks';

const gitignorePath = fileURLToPath(new URL('.gitignore', import.meta.url));

// eslint-plugin-react and eslint-plugin-jsx-a11y still call context methods
// that were removed in ESLint 10. fixupPluginRules shims them.
const reactRecommended = {
  ...pluginReact.configs.flat.recommended,
  plugins: { react: fixupPluginRules(pluginReact) },
};
const jsxA11yRecommended = {
  ...pluginJsxA11y.flatConfigs.recommended,
  plugins: { 'jsx-a11y': fixupPluginRules(pluginJsxA11y) },
};

export default [
  includeIgnoreFile(gitignorePath, 'Imported .gitignore patterns'),
  { ignores: ['**/*.d.ts', 'public/', 'app/components/ui/'] },
  { files: ['**/*.{js,mjs,ts,tsx}'] },
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  reactRecommended,
  jsxA11yRecommended,
  {
    plugins: { 'react-hooks': pluginReactHooks },
    rules: pluginReactHooks.configs.recommended.rules,
  },
  { settings: { react: { version: '19' } } },
  {
    rules: {
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'no-console': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Tests rely on partial mocks (`as any`).
    files: ['**/*.test.{ts,tsx}', 'app/tests/**', 'e2e/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
];
