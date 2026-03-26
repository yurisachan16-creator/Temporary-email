module.exports = {
  // 使用 jsdom 模拟浏览器 DOM 环境（content.js 测试需要）
  testEnvironment: 'jsdom',

  // setupFiles 在每个测试文件运行前执行：
  //   1. jest-webextension-mock：注入 browser/chrome API mock
  //   2. tests/setup.js：注入全局 fetch mock
  setupFiles: [
    'jest-webextension-mock',
    '<rootDir>/tests/setup.js'
  ],

  // 只匹配 tests/ 目录下的测试文件
  testMatch: ['<rootDir>/tests/**/*.test.js'],

  // 统计 src/ 下所有 JS 文件的测试覆盖率
  collectCoverageFrom: ['<rootDir>/src/**/*.js'],

  // 使用 babel-jest 转换 ES Module 语法
  transform: {
    '^.+\\.js$': 'babel-jest'
  }
};
