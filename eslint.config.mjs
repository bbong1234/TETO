import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const nextFlat = require('eslint-config-next/core-web-vitals');

/**
 * Next / eslint-plugin-react-hooks 7 含 React Compiler 规则，与现有数据拉取/受控 state 模式大量冲突。
 * 先关闭编译器类规则，保留 hooks 依赖等传统检查；后续可逐项收紧。
 */
const relaxReactCompiler = {
  rules: {
    'import/no-anonymous-default-export': 'off',
    'react-hooks/set-state-in-effect': 'off',
    'react-hooks/refs': 'off',
    'react-hooks/purity': 'off',
    'react-hooks/preserve-manual-memoization': 'off',
    'react-hooks/static-components': 'off',
    'react-hooks/immutability': 'off',
    /** 中文文案中常见引号，暂不强制转义 */
    'react/no-unescaped-entities': 'off',
  },
};

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  ...nextFlat,
  relaxReactCompiler,
  {
    ignores: ['eval/**'],
  },
];

export default eslintConfig;
