# 子商户号重置 Tampermonkey 脚本

运营后台脚本集合，用于在 `https://om.leshuazf.com/` 自动重置微信/支付宝子商户号。

当前包含两条业务线：

| 业务线 | 脚本文件 | 当前版本 | 控制台对象 | 悬浮球位置 |
| --- | --- | --- | --- | --- |
| 联合收单 | `lhsd-submch-reset.user.js` | `0.0.9` | `lhsdAutoReport` | 右下角 |
| 收银通 | `syt-submch-reset.user.js` | `0.0.11` | `sytAutoReport` | 右下角上方 |

两个脚本可以同时安装。它们使用不同的面板容器 id，避免悬浮球互相覆盖：

- 联合收单：`lhsd-auto-report-panel`
- 收银通：`syt-auto-report-panel`

`omAutoReport` 仍保留兼容，但两个脚本同时安装时会被后加载的脚本覆盖；维护和调试时请优先使用业务线专属对象。

## 安装地址

使用 Tampermonkey 打开 Raw 地址安装：

```text
https://gitee.com/swxswxer1/submch-reset/raw/master/lhsd-submch-reset.user.js
https://gitee.com/swxswxer1/submch-reset/raw/master/syt-submch-reset.user.js
```

不要使用 `blob` 预览页安装，例如：

```text
https://gitee.com/swxswxer1/submch-reset/blob/master/lhsd-submch-reset.user.js
```

`blob` 地址返回的是 Gitee HTML 页面，不是脚本源码，Tampermonkey 可能无法完成安装或更新。

## 使用方式

1. 登录运营后台。
2. 打开 `https://om.leshuazf.com/` 下的后台页面。
3. 点击右下角“重置”悬浮球。
4. 输入 10 位乐刷商户号。
5. 按需点击“微信重置子商户号”“支付宝重置子商户号”或“全部重置子商户号”。

点击任意重置按钮时，脚本会先清空微信和支付宝两个输出框，避免上一次成功结果残留导致误复制。

执行成功后，输出框会展示新上报的微信/支付宝子商户号，并支持一键复制。复制内容格式：

```text
微信：xxxx
支付宝：xxxx
```

## 白名单

脚本执行重置前会读取 Gitee 仓库中的远程白名单文件：

| 业务线 | 白名单文件 | 脚本内读取地址 |
| --- | --- | --- |
| 联合收单 | `lhsd-whitelist.json` | `https://raw.giteeusercontent.com/swxswxer1/submch-reset/raw/master/lhsd-whitelist.json` |
| 收银通 | `syt-whitelist.json` | `https://raw.giteeusercontent.com/swxswxer1/submch-reset/raw/master/syt-whitelist.json` |

白名单文件是 JSON 字符串数组：

```json
[
  "张三",
  "李四"
]
```

脚本会从顶部欢迎语解析当前登录用户姓名，例如：

```js
document.querySelector("body > div.panel.layout-panel.layout-panel-north.layout-split-north > div > span.head > span")
```

示例文本：

```text
欢迎 杨浩鑫(深圳移卡科技有限公司)
```

解析得到 `杨浩鑫` 后，与对应业务线白名单比对。读取失败、格式错误、姓名不在白名单，都会禁止执行重置。

远程白名单读取使用 `GM_xmlhttpRequest`，脚本头部需要保留：

```js
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      gitee.com
// @connect      raw.giteeusercontent.com
```

注意：白名单是前端脚本层面的操作限制，用于防误操作和入口管控；真正权限仍以后端接口权限为准。

## 业务流程

### 联合收单微信

1. 校验乐刷商户号必须是 10 位数字。
2. 校验当前登录用户命中联合收单白名单。
3. 调用微信上报接口。
4. 获取上报接口返回的新微信子商户号。
5. 上报后等待 3 秒。
6. 每隔 1.5 秒查询新微信子商户号映射记录。
7. 最近 3 次查询到的“未通知”通道集合一致后，设置新微信子商户号为启用。
8. 查询 5 年内旧启用微信子商户号，并按 `微信子商户号 + payType` 分组禁用旧号。

联合收单微信需要手动启用新上报的“未通知”记录。

### 联合收单支付宝

1. 校验乐刷商户号和白名单。
2. 调用支付宝上报接口。
3. 获取新支付宝子商户号。
4. 轮询确认新支付宝子商户号已启用。
5. 查询 5 年内旧启用支付宝子商户号，并按分组禁用旧号。

支付宝上报成功后，新支付宝子商户号默认已启用，因此不需要手动启用新号。

### 收银通微信

1. 校验乐刷商户号和收银通白名单。
2. 调用收银通微信上报接口。
3. 从响应 `data.wxMchId` 获取新微信子商户号。
4. 上报后等待 3 秒。
5. 查询新微信子商户号是否已启用；未查到则每隔 2 秒重试，最多重试 3 次。
6. 查询 5 年内旧启用微信子商户号，并按分组禁用旧号。

收银通微信上报参数里 `notice=1` 表示启用通知，新号上报后不需要再手动启用，只需要确认启用成功。

### 收银通支付宝

1. 校验乐刷商户号和收银通白名单。
2. 调用收银通支付宝上报接口。
3. 从响应 `data.zfbSubMch` 获取新支付宝子商户号。
4. 轮询确认新支付宝子商户号已启用。
5. 查询 5 年内旧启用支付宝子商户号，并按分组禁用旧号。

## 上报响应差异

联合收单上报接口历史上按字符串子商户号处理：

```json
{
  "respCode": 0,
  "data": "892089924"
}
```

收银通上报接口返回对象，因此脚本会归一化为后续流程使用的字符串。

微信：

```json
{
  "respCode": 0,
  "respMsg": "上报成功",
  "data": {
    "result": 0,
    "msg": "上报成功",
    "wxMchId": "892089924"
  }
}
```

支付宝：

```json
{
  "respCode": 0,
  "respMsg": "上报成功",
  "data": {
    "result": 0,
    "msg": "上报成功",
    "zfbSubMch": "2088580812349129"
  }
}
```

收银通脚本里 `submitWechatReport` 会把 `data.wxMchId` 归一化到 `report.data`；`submitAlipayReport` 会把 `data.zfbSubMch` 归一化到 `report.data`，并保留原始对象到 `rawData`。

## 通道状态设置

状态设置接口按查询到的通道决定要传哪些参数：

| 通道 | 参数名 |
| --- | --- |
| 银联 | `unionStatus` |
| 网联 | `nuccStatus` |
| 网联互联互通 | `interconnectionStatus` |

只传查询结果中实际存在且需要修改的通道参数。比如只有“银联”和“网联互联互通”，就不要传 `nuccStatus`。

状态值约定：

- `1`：启用
- `0`：禁用

禁用旧号时，如果一个分组内某个通道已经是禁用，只传仍为启用的通道。

## 控制台调用

联合收单：

```js
await lhsdAutoReport.wechatAutoReport('9550117355')
await lhsdAutoReport.alipayAutoReport('9550117355')
await lhsdAutoReport.allAutoReport('9550117355')
```

收银通：

```js
await sytAutoReport.wechatAutoReport('9550117355')
await sytAutoReport.alipayAutoReport('9550117355')
await sytAutoReport.allAutoReport('9550117355')
```

`autoReport` 是微信流程别名：

```js
await lhsdAutoReport.autoReport('9550117355')
await sytAutoReport.autoReport('9550117355')
```

## 文件说明

| 文件 | 用途 |
| --- | --- |
| `lhsd-submch-reset.user.js` | 联合收单 Tampermonkey 脚本 |
| `syt-submch-reset.user.js` | 收银通 Tampermonkey 脚本 |
| `lhsd-whitelist.json` | 联合收单远程白名单 |
| `syt-whitelist.json` | 收银通远程白名单 |
| `README.md` | 项目说明和维护入口 |

## 发布流程

1. 修改脚本或白名单。
2. 如果修改脚本逻辑，更新对应脚本头部 `@version`。
3. 本地检查语法：

```bash
node --check lhsd-submch-reset.user.js
node --check syt-submch-reset.user.js
```

4. 提交并推送：

```bash
git add README.md lhsd-submch-reset.user.js syt-submch-reset.user.js lhsd-whitelist.json syt-whitelist.json
git commit -m "说明本次修改"
git push origin master
```

5. 在 Tampermonkey 中手动检查更新，确认脚本版本已变更。

如果只是修改白名单 JSON，不需要改脚本版本；白名单读取时带时间戳参数，会尽量避免缓存影响。

## 常见问题

### 只显示一个悬浮球

检查两个脚本是否都更新到支持独立容器 id 的版本：

- 联合收单 `0.0.8+`
- 收银通 `0.0.9+`

旧版本两个脚本都使用 `om-auto-report-panel`，会互相覆盖。

### 白名单读取失败

重点检查：

- Tampermonkey 是否已更新到包含 `@connect raw.giteeusercontent.com` 的版本。
- 白名单 URL 是否能直接打开。
- 白名单文件是否是合法 JSON 数组。
- 脚本是否使用 `requestWhitelistText` 读取白名单，避免被后台接口的 `requestText` 覆盖。

### 控制台对象不对

两个脚本同时安装时，不要依赖 `omAutoReport`。请使用：

- `lhsdAutoReport`
- `sytAutoReport`

### 推送失败：SSH agent 没有 key

如果出现：

```text
sign_and_send_pubkey: signing failed
Permission denied (publickey)
```

先加载 SSH key：

```bash
ssh-add ~/.ssh/id_rsa
git push origin master
```

### 不要提交本地 IDE 文件

`.gitignore` 已忽略 `.idea/` 和 `.DS_Store`。提交前用：

```bash
git status --short
```

确认没有无关文件。
