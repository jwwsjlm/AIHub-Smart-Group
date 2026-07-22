export default [
  {
    files: ['aihub-smart-group.user.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        GM_addStyle: 'readonly',
        GM_getValue: 'readonly',
        GM_registerMenuCommand: 'readonly',
        GM_setValue: 'readonly',
        MutationObserver: 'readonly',
        URLSearchParams: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        location: 'readonly',
        unsafeWindow: 'readonly',
        window: 'readonly',
      },
    },
    rules: {
      'no-dupe-keys': 'error',
      'no-redeclare': 'error',
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-unused-vars': 'error',
    },
  },
  {
    files: ['scripts/**/*.cjs', 'tests/**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        __dirname: 'readonly',
        module: 'readonly',
        process: 'readonly',
        require: 'readonly',
      },
    },
    rules: {
      'no-dupe-keys': 'error',
      'no-redeclare': 'error',
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-unused-vars': 'error',
    },
  },
];
