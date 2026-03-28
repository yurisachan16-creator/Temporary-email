# TempMail+ 上线操作清单

## 前置步骤（所有平台共用）

```bash
# 1. 确保依赖和图标都是最新的
npm install
npm run setup

# 2. 确认测试全部通过
npm test

# 3. 打包
npm run build
# 输出：
#   dist/tempmail-plus-chrome-v2.0.2.zip
#   dist/tempmail-plus-firefox-v2.0.2.zip
```

截图要求（各商店至少 1 张）：
- **尺寸**：1280×800 像素（或 640×400）
- **建议截图内容**：弹窗主界面、深色模式、邮件详情页

---

## 路径 1：GitHub Releases（自动，推 tag 即可）

```bash
# 确保代码已推送到 GitHub
git push origin main

# 打 tag（触发 GitHub Actions 自动构建和发布）
git tag v2.0.2
git push origin v2.0.2
```

等待约 2-3 分钟，访问 GitHub 仓库的 **Releases** 页面，确认：
- [ ] 两个 ZIP 文件已附加
- [ ] Release Notes 自动生成

用户安装方式：下载 ZIP → 解压 → `chrome://extensions` → 加载已解压的扩展程序

---

## 路径 2：Firefox AMO（免费，需审核）

1. 注册 Mozilla 账号：https://addons.mozilla.org/
2. 点击「提交新附加组件」→ 选择「在 AMO 上发布」
3. 上传：`dist/tempmail-plus-firefox-v2.0.2.zip`
4. 填写商店信息（参考 `store/description-zh.md` 和 `store/description-en.md`）
5. 上传截图（至少 1 张）
6. 提交审核（通常 1-3 个工作日）

注意：Firefox AMO 要求代码无混淆，本项目已满足。

---

## 路径 3：Chrome Web Store（需 $5 开发者费）

1. 注册 Chrome Web Store 开发者账号：https://chrome.google.com/webstore/devconsole/
   - 一次性费用：$5（支付宝/信用卡均可）
2. 点击「新建项目」→ 上传 `dist/tempmail-plus-chrome-v2.0.2.zip`
3. 填写商店信息（参考 `store/description-en.md`）
4. 上传图标（128×128，已在 `src/icons/icon128.png`）
5. 上传截图（至少 1 张 1280×800）
6. 填写隐私政策 URL（将 `store/privacy-policy.md` 发布到 GitHub Pages 或类似平台后填写 URL）
7. 选择类别：生产力工具
8. 提交审核（通常 1-3 个工作日）
