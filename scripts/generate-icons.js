/**
 * generate-icons.js
 * 使用纯 Node.js 内置模块（zlib + fs）生成插件 PNG 图标
 * 生成三种尺寸：16×16、48×48、128×128
 * 主题色：#4F46E5（靛蓝，与 PRD 设计规范一致）
 */

'use strict';

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

/* ── PNG 工具函数 ─────────────────────────────────── */

/**
 * 计算 CRC32 校验值（PNG 规范要求每个数据块携带 CRC）
 * @param {Buffer} buf
 * @returns {number}
 */
function crc32(buf) {
  // 预计算 CRC 查找表
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }

  let crc = 0xFFFFFFFF;
  for (const byte of buf) {
    crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * 将数字写入大端序 4 字节 Buffer
 * @param {number} n
 * @returns {Buffer}
 */
function uint32BE(n) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(n, 0);
  return buf;
}

/**
 * 创建一个 PNG 数据块（长度 + 类型 + 数据 + CRC）
 * @param {string} type  - 4 字节 ASCII 类型标识
 * @param {Buffer} data  - 块数据
 * @returns {Buffer}
 */
function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const crcBytes  = uint32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([uint32BE(data.length), typeBytes, data, crcBytes]);
}

/**
 * 生成指定尺寸与颜色的纯色 PNG 图片
 * @param {number} size       - 图片边长（像素）
 * @param {number} r          - 红色分量 0-255
 * @param {number} g          - 绿色分量 0-255
 * @param {number} b          - 蓝色分量 0-255
 * @returns {Buffer} PNG 文件二进制内容
 */
function createSolidPNG(size, r, g, b) {
  // PNG 文件签名（固定 8 字节）
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR：图像头部
  // 位深度 8、颜色类型 2（RGB）、压缩/过滤/隔行均为 0
  const ihdrData = Buffer.concat([
    uint32BE(size),
    uint32BE(size),
    Buffer.from([8, 2, 0, 0, 0])
  ]);
  const ihdr = pngChunk('IHDR', ihdrData);

  // 构造原始图像数据：每行 = 过滤字节(0) + size 个 RGB 像素
  const rowBuf = Buffer.alloc(1 + size * 3);
  rowBuf[0] = 0; // 过滤类型：None
  for (let i = 0; i < size; i++) {
    rowBuf[1 + i * 3]     = r;
    rowBuf[2 + i * 3] = g;
    rowBuf[3 + i * 3] = b;
  }
  // 所有行拼接后使用 zlib deflate 压缩
  const rawRows    = Buffer.concat(Array.from({ length: size }, () => rowBuf));
  const compressed = zlib.deflateSync(rawRows);
  const idat       = pngChunk('IDAT', compressed);

  // IEND：结束块（数据为空）
  const iend = pngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

/* ── 生成图标文件 ─────────────────────────────────── */

// 图标输出目录（位于 src/ 内，manifest.json 中路径相对于此）
const ICONS_DIR = path.join(__dirname, '../src/icons');

// 主题色 #4F46E5 = rgb(79, 70, 229)
const [R, G, B] = [79, 70, 229];

// 确保目录存在
fs.mkdirSync(ICONS_DIR, { recursive: true });

// 生成三种尺寸
const SIZES = [16, 48, 128];
for (const size of SIZES) {
  const png      = createSolidPNG(size, R, G, B);
  const filepath = path.join(ICONS_DIR, `icon${size}.png`);
  fs.writeFileSync(filepath, png);
  console.log(`✓ 已生成 ${filepath}`);
}

console.log('\n图标生成完成。');
