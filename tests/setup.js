/**
 * Jest 全局测试环境初始化
 * 此文件在每个测试套件执行前运行
 */

// 将 fetch 替换为 Jest mock 函数，方便各测试文件按需配置返回值
global.fetch = jest.fn();
