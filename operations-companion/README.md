# 运营工具快捷菜单

第一期桌面小工具，适用于 Windows 和 macOS。

## 当前能力

1. 在任意应用中选中并复制 10 位乐刷商户号。
2. Windows 按 `Ctrl + R`、macOS 按 `Command + R` 打开快捷操作菜单。
3. 从剪贴板识别商户号，并选择以下操作：
   - 联合收单重置微信、支付宝、全部
   - 收银通重置微信、支付宝、全部
   - 配置商户 key

## 开发启动

```bash
npm install
npm run tauri dev
```

## 第一期开关说明

本期已完成跨应用快捷键、剪贴板读取及操作选择界面。菜单操作会生成结构化指令；下一期接入 Chrome Native Messaging 后，将由已登录运营后台的 Chrome 插件实际执行操作并把结果回传。

## Chrome 插件固定 ID

Native Messaging 使用固定扩展 ID：`mcimgfeelkjaeonopegodhlcopniajbo`。所有用户必须加载仓库内同一份 `chrome-extension/dist`，不要修改 `manifest.json` 内的 `key` 字段。

## Windows 安装包发布

仓库推送以 `v` 开头的标签时，GitHub Actions 会自动在 Windows 环境构建 NSIS 安装包，并上传到该标签对应的 GitHub Release。例如：

```bash
git tag v0.1.0
git push github v0.1.0
```

安装包可在 GitHub 仓库的 Releases 页面下载。
