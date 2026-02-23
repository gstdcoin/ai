import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        ignores: ['.next/**', 'node_modules/**', 'out/**', 'public/**'],
    },
    {
        files: ['src/**/*.{ts,tsx,js,jsx}'],
        plugins: {
            '@typescript-eslint': tsPlugin,
            'react': reactPlugin,
            'react-hooks': reactHooksPlugin,
            '@next/next': nextPlugin,
        },
        languageOptions: {
            parser: tsParser,
            globals: {
                ...globals.browser,
                ...globals.node,
                React: 'readonly',
                jsx: 'readonly',
                jsxs: 'readonly',
                h3: 'readonly',
                mapboxgl: 'readonly',
                TonConnect: 'readonly',
                Telegram: 'readonly',
            },
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            ...reactPlugin.configs.recommended.rules,
            ...reactHooksPlugin.configs.recommended.rules,
            ...nextPlugin.configs.recommended.rules,
            'react/react-in-jsx-scope': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'warn',
            'prefer-const': 'warn',
            'react-hooks/exhaustive-deps': 'warn',
            'no-undef': 'warn',
            'no-empty': 'warn',
            '@typescript-eslint/no-empty-function': 'warn',
            '@typescript-eslint/no-unsafe-function-type': 'warn',
            'react/no-unescaped-entities': 'off',
            '@next/next/no-img-element': 'warn',
            'react-hooks/static-components': 'warn',
            'react-hooks/set-state-in-effect': 'warn',
            'react/display-name': 'off',
            'no-unused-vars': 'warn',
            'react-hooks/purity': 'warn',
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/immutability': 'off',
            '@typescript-eslint/no-use-before-define': 'off',
            'no-async-promise-executor': 'warn',
            '@typescript-eslint/no-require-imports': 'warn',
            'react/jsx-no-target-blank': 'warn',
            'react/no-unknown-property': ['error', { ignore: ['jsx', 'global'] }],
        },
    },
];
