# 联合收单重置子商户号脚本

运营后台 Tampermonkey 脚本，用于重置联合收单微信/支付宝子商户号。

## 安装地址

使用 Tampermonkey 打开以下 Raw 地址安装：

```text
https://gitee.com/swxswxer1/submch-reset/raw/master/lhsd-submch-reset.user.js
```

不要使用 `blob` 预览页地址安装，例如：

```text
https://gitee.com/swxswxer1/submch-reset/blob/master/lhsd-submch-reset.user.js
```

`blob` 地址返回的是 Gitee 页面 HTML，不是脚本源码，Tampermonkey 可能无法完成安装。

## 使用方式

1. 登录运营后台。
2. 打开 `https://om.leshuazf.com/` 下的后台页面。
3. 点击右下角“重置”悬浮球。
4. 输入 10 位乐刷商户号。
5. 按需点击：
   - 微信重置子商户号
   - 支付宝重置子商户号
   - 全部重置子商户号

执行成功后，脚本会在输出框展示新上报的微信/支付宝子商户号，并支持一键复制。

## 当前流程

### 微信

1. 调用微信上报接口，获取新微信子商户号。
2. 上报后等待 3 秒。
3. 每隔 1.5 秒查询一次新微信子商户号映射记录。
4. 最近 3 次查询到的“未通知”通道集合一致后，设置新微信子商户号为启用。
5. 查询 5 年内旧启用微信子商户号，并按通道禁用旧号。

### 支付宝

1. 调用支付宝上报接口，获取新支付宝子商户号。
2. 轮询确认新支付宝子商户号已启用。
3. 查询 5 年内旧启用支付宝子商户号，并按通道禁用旧号。

支付宝上报成功后，新支付宝子商户号默认已启用，因此不需要手动启用新号。

## 自动更新

脚本通过 Tampermonkey 的远程脚本机制更新。发布新版本时：

1. 修改脚本头部的 `@version`。
2. 提交并推送到 Gitee。
3. 用户 Tampermonkey 会按更新周期检查，也可以手动检查用户脚本更新。

## 白名单

脚本执行重置前会读取 Gitee 仓库中的白名单文件：

- 联合收单：`lhsd-whitelist.json`
- 收银通：`syt-whitelist.json`

以后只需要修改对应 JSON 文件并推送到 Gitee，就可以调整允许执行重置的用户；脚本取不到白名单时会禁止执行。

## 控制台函数

```js
await omAutoReport.wechatAutoReport('9550117355')
await omAutoReport.alipayAutoReport('9550117355')
await omAutoReport.allAutoReport('9550117355')
```

`autoReport` 目前是微信流程别名：

```js
await omAutoReport.autoReport('9550117355')
```
