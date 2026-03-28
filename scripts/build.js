'use strict';

// 打包脚本：将 src/ 目录分别打包为 Chrome 和 Firefox 发布 ZIP
// 输出到 dist/ 目录

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// 项目根目录
const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');
const DIST_DIR = path.join(ROOT, 'dist');

// 从 src/manifest.json 读取版本号
const mainManifest = JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'manifest.json'), 'utf-8'));
const VERSION = mainManifest.version;

/**
 * 递归收集目录下所有文件
 * @param {string} dir 要遍历的目录
 * @param {string} baseDir 用于计算相对路径的基准目录
 * @returns {{ filePath: string, relPath: string }[]}
 */
function collectFiles(dir, baseDir) {
  const results = [];

  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

    if (fs.statSync(fullPath).isDirectory()) {
      results.push(...collectFiles(fullPath, baseDir));
    } else {
      results.push({ filePath: fullPath, relPath });
    }
  }

  return results;
}

/**
 * 为指定平台构建 ZIP 包
 * @param {'chrome' | 'firefox'} platform
 * @param {string} platformManifestPath 该平台使用的 manifest 文件路径
 */
function buildPlatform(platform, platformManifestPath) {
  console.log(`\n📦 构建 ${platform} 包...`);

  const zip = new AdmZip();

  // 收集 src/ 下所有文件
  const files = collectFiles(SRC_DIR, SRC_DIR);

  for (const { filePath, relPath } of files) {
    // 跳过平台专用 manifest 子目录（不直接打入 ZIP）
    if (relPath.startsWith('manifest/')) {
      continue;
    }

    // 跳过 src/manifest.json（后面替换为平台版本）
    if (relPath === 'manifest.json') {
      continue;
    }

    zip.addFile(relPath, fs.readFileSync(filePath));
    console.log(`  ✔ ${relPath}`);
  }

  // 注入平台对应的 manifest.json
  const platformManifestContent = fs.readFileSync(platformManifestPath);
  zip.addFile('manifest.json', platformManifestContent);
  console.log(`  ✔ manifest.json (${platform} 版)`);

  // 确保 dist/ 目录存在
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  // 写出 ZIP 文件
  const outputPath = path.join(DIST_DIR, `tempmail-plus-${platform}-v${VERSION}.zip`);
  zip.writeZip(outputPath);

  const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(1);
  console.log(`  ✅ 输出：${outputPath}（${sizeKB} KB）`);
}

// 解析命令行参数，支持单独构建某一平台
const args = process.argv.slice(2);
const buildChrome = args.length === 0 || args.includes('--chrome');
const buildFirefox = args.length === 0 || args.includes('--firefox');

console.log(`🚀 TempMail+ v${VERSION} 打包开始`);

if (buildChrome) {
  buildPlatform('chrome', path.join(SRC_DIR, 'manifest', 'manifest.chrome.json'));
}

if (buildFirefox) {
  buildPlatform('firefox', path.join(SRC_DIR, 'manifest', 'manifest.firefox.json'));
}

console.log('\n🎉 打包完成！');
