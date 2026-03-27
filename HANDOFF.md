# TempMail+ — AI 交接文档

> 写给接手此项目的 AI（如 Codex）。请完整阅读本文件后再动手。

---

## 一、项目概况

**仓库**：`git@github.com:yurisachan16-creator/Temporary-email.git`
**本地路径**：`D:\社团练习\网页插件`
**当前版本**：v2.0.2
**测试状态**：157 / 157 通过（`npm test`）

TempMail+ 是一个临时邮箱工具，有两种交付形态：

| 形态 | 入口 | 状态 |
|------|------|------|
| 浏览器扩展（Chrome/Edge MV3 + Firefox MV2）| `src/` | ✅ 已补齐双提供商、冷门域名、语言切换 |
| Tampermonkey 用户脚本 | `tampermonkey/TempMail+.user.js` | ✅ 已支持双提供商、冷门域名、语言切换 |

---

## 二、当前实现状态

### 浏览器扩展
- 使用共享 `src/api/mailService.js`，优先 1secmail 冷门域名，异常时自动回退 mail.tm
- 使用共享 `src/utils/storage.js` 管理多邮箱、主题、语言、provider 会话
- 设置页已支持 `auto / zh / en` 语言切换与主题切换
- 删除 mail.tm 邮箱时会同步删除远端账号并清理本地会话

### Tampermonkey
- 保留原有双提供商、冷门域名、拖拽面板逻辑
- 新增标题栏语言切换按钮，支持 `auto / zh / en` 循环切换
- 语言偏好持久化存储在 `tm_language`

### 当前建议关注点
1. 浏览器扩展暂无桌面通知与有效期倒计时，仍处于 v2.0 范围
2. popup 侧已有共享服务，但 Tampermonkey 仍保留内嵌 API 逻辑，后续若继续演进可考虑进一步抽公共层
3. 文档已同步到 v2.0.2，后续改动需同时更新 README / PRD / CHANGELOG

---

## 三、项目规范（必须遵守）

### 语言要求
- **代码注释**：全部使用**中文**
- **Git 提交信息**：全部使用**中文**（格式见下）
- **变量/函数/文件名**：使用英文（代码惯例）

### Git 工作流

```
main          ← 仅接受来自 develop 的合并，同时打版本 tag
  └── develop ← 集成分支，接受功能/修复分支合并
        ├── feat/xxx    ← 新功能
        └── fix/xxx     ← Bug 修复
```

**标准操作流程**：

```bash
# 1. 从 develop 切出修复分支
git checkout develop
git checkout -b fix/tampermonkey-403

# 2. 修改代码，运行测试确认通过
npm test

# 3. 提交（中文提交信息 + Conventional Commits 前缀）
git add <文件>
git commit -m "fix(tampermonkey): 修复 gmFetch 403 问题，改用 mail.tm 作为备用 API"

# 4. 合并回 develop
git checkout develop
git merge fix/tampermonkey-403 --no-ff -m "merge: 合并 403 修复分支"

# 5. 如果是发布版本，再合并到 main 并打 tag
git checkout main
git merge develop --no-ff -m "merge: 发布 v1.1.0"
git tag v1.1.0 -m "v1.1.0 修复 Tampermonkey 403 问题"
```

### 提交信息格式

```
<类型>(<范围>): <中文描述>

# 类型：feat / fix / chore / docs / style / refactor / test
# 示例：
fix(tampermonkey): 修复 gmFetch 在特定网络环境下返回 403 的问题
feat(tampermonkey): 新增 mail.tm 作为 1secmail 的备用 API
test(tampermonkey): 补充 gmFetch fallback 逻辑的单元测试
```

### 测试规范

- **测试用例不可修改**（`tests/` 目录下原有的 80 个测试是合同，实现必须满足它们）
- 新增功能或修复**必须**补充对应测试
- 每次提交前必须确保 `npm test` 全部通过
- 测试文件位置：`tests/<模块名>/<文件名>.test.js`
- Tampermonkey 测试：`tests/tampermonkey/gmApi.test.js`（已有 27 个用例）

### 代码风格

- `'use strict'`
- 函数均需 JSDoc 注释（中文）
- 不直接在 JS/HTML 中硬编码用户可见文字，统一放 `src/i18n/zh.json` 和 `src/i18n/en.json`
- 所有 1secmail API 调用只能通过 `src/api/mailService.js`（扩展版）或 `gmFetch`（Tampermonkey 版）

---

## 四、项目结构速览

```
D:\社团练习\网页插件\
├── src/                        # 浏览器扩展源码（加载此目录到 Chrome）
│   ├── manifest.json           # Chrome/Edge MV3
│   ├── manifest/
│   │   ├── manifest.chrome.json
│   │   └── manifest.firefox.json
│   ├── popup/popup.js          # 弹窗主逻辑（browser.* API）
│   ├── content/content-script.js  # 自动填入内容脚本
│   ├── api/mailService.js      # 1secmail API 封装（ES Module）
│   ├── utils/storage.js        # browser.storage.local 封装
│   ├── utils/sanitize.js       # DOMPurify HTML 消毒
│   ├── i18n/zh.json            # 中文语言包
│   ├── i18n/en.json            # 英文语言包
│   └── lib/                    # 第三方库（polyfill + DOMPurify）
├── tampermonkey/
│   └── TempMail+.user.js       # ← Bug 在这里，gmFetch 函数
├── tests/
│   ├── api/mailService.test.js
│   ├── utils/storage.test.js
│   ├── utils/sanitize.test.js
│   ├── i18n/i18n.test.js
│   ├── content/content.test.js
│   └── tampermonkey/gmApi.test.js  # ← Tampermonkey 专项测试
├── PRD.md                      # 产品需求文档
├── CHANGELOG.md                # 版本变更记录
└── README.md                   # 用户使用文档
```

---

## 五、开发环境搭建

```bash
# Node.js 18+，npm 自带
git clone git@github.com:yurisachan16-creator/Temporary-email.git
cd Temporary-email
npm run setup    # = npm install + node scripts/copy-libs.js
npm test         # 应输出：107 passed
```

---

## 六、给接手 AI 的提示词模板

将以下内容复制给 Codex 或其他 AI：

---

**提示词开始**

你正在接手一个浏览器插件项目 TempMail+，仓库地址：`git@github.com:yurisachan16-creator/Temporary-email.git`

**你的唯一任务**：修复 `tampermonkey/TempMail+.user.js` 中的 403 错误。

**问题描述**：
用户在 B 站等网页上使用 Tampermonkey 脚本时，点击「生成临时邮箱」，`GM_xmlhttpRequest` 请求 `https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1` 始终返回 HTTP 403，响应体为标准 Apache Forbidden 页面。相同 URL 在浏览器地址栏直接访问正常。

**已排除的原因**：
- Referer 头（已移除）
- Origin 头（从未设置）
- Cookie 携带（anonymous: true）

**解决要求**：
1. 找到 403 的真正原因并修复；若确认 1secmail 在该环境不可用，改用可访问的备用 API（如 mail.tm），保持相同的对外接口（`apiGenerateEmail` 返回邮箱字符串，`apiGetMessages` 返回消息数组，`apiReadMessage` 返回消息对象）
2. `npm test` 必须全部通过（当前 107 个测试），修改或新增 `tests/tampermonkey/gmApi.test.js` 中的用例以覆盖改动
3. 所有注释使用**中文**
4. 使用 Git 管理版本：从 `develop` 切出 `fix/tampermonkey-403` 分支，修复完成后合并回 `develop`，提交信息使用中文

**规范文件**：`HANDOFF.md`（项目根目录）包含完整的代码规范和 Git 工作流，请先阅读。

**提示词结束**

---

## 七、当前版本状态

```
v2.0.2（feat/browser-parity-sync）
  ✅ 浏览器扩展：已补齐双提供商、冷门域名、语言切换
  ✅ Tampermonkey 脚本：已支持语言切换且保持双提供商逻辑
  ✅ 157 个单元测试全部通过
```
