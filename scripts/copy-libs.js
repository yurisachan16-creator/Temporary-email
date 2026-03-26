/**
 * copy-libs.js
 * 将运行时依赖库从 node_modules 复制到 src/lib/
 * 供浏览器扩展直接加载（无需打包）
 *
 * 用法：npm run copy:libs
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const LIB_DIR = path.join(__dirname, '../src/lib');

// 确保输出目录存在
fs.mkdirSync(LIB_DIR, { recursive: true });

// 要复制的库列表
const LIBS = [
  {
    src:  'webextension-polyfill/dist/browser-polyfill.min.js',
    dest: 'browser-polyfill.min.js',
    desc: 'webextension-polyfill（跨浏览器 API 兼容层）'
  },
  {
    src:  'dompurify/dist/purify.min.js',
    dest: 'dompurify.min.js',
    desc: 'DOMPurify（HTML 消毒，防止 XSS）'
  }
];

for (const lib of LIBS) {
  const srcPath  = path.join(__dirname, '../node_modules', lib.src);
  const destPath = path.join(LIB_DIR, lib.dest);

  if (!fs.existsSync(srcPath)) {
    console.error(`✗ 未找到 ${lib.src}，请先运行 npm install`);
    process.exit(1);
  }

  fs.copyFileSync(srcPath, destPath);
  const sizeKB = (fs.statSync(destPath).size / 1024).toFixed(1);
  console.log(`✓ ${lib.desc}  →  src/lib/${lib.dest}  (${sizeKB} KB)`);
}

console.log('\n库文件复制完成。');
