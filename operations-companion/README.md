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

## Chrome 插件联动

桌面工具首次启动时会自动注册 Chrome Native Messaging Host。之后操作流程如下：

1. 在 Chrome 中启用本仓库 `chrome-extension/dist` 目录中的“运营工具”扩展。
2. 登录并保持至少一个 `https://om.leshuazf.com/` 运营后台页面打开。
3. 在任意应用中复制 10 位乐刷商户号，按 Windows `Ctrl + R` 或 macOS `Command + R`。
4. 选择收银通/联合收单及重置通道，桌面工具会把指令发送给 Chrome 插件。
5. Chrome 插件会展开自己的面板、同步显示执行结果，并在重置结束后自动复制结果。

桥接只监听本机回环地址，且桌面工具和 Native Host 使用本机随机令牌校验。未启动 Chrome 或未启用扩展时，桌面工具会提示连接失败。

## Chrome 插件固定 ID

Native Messaging 使用固定扩展 ID：`mcimgfeelkjaeonopegodhlcopniajbo`。所有用户必须加载仓库内同一份 `chrome-extension/dist`，不要修改 `manifest.json` 内的 `key` 字段。

## Windows 安装包发布

仓库推送以 `v` 开头的标签时，GitHub Actions 会自动在 Windows 环境构建 NSIS 安装包，并上传到该标签对应的 GitHub Release。例如：

```bash
git tag v0.1.0
git push github v0.1.0
```

安装包可在 GitHub 仓库的 Releases 页面下载。
