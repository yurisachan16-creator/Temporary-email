module.exports = {
  presets: [
    // 将 ES Module 语法转换为 Node.js 可执行的 CommonJS，供 Jest 使用
    ['@babel/preset-env', { targets: { node: 'current' } }]
  ]
};
