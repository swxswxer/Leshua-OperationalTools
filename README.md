# 子商户号重置 Tampermonkey 脚本

运营后台脚本集合，用于在 `https://om.leshuazf.com/` 自动重置微信/支付宝子商户号。

当前包含两条业务线：

| 业务线 | 脚本文件 | 当前版本 | 控制台对象 | 悬浮球位置 |
| --- | --- | --- | --- | --- |
| 联合收单 | `lhsd-submch-reset.user.js` | `1.0.0` | `lhsdAutoReport` | 右下角 |
| 收银通 | `syt-submch-reset.user.js` | `1.0.0` | `sytAutoReport` | 右下角上方 |

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

## 业务流程

两个脚本均不再校验前端白名单，安装后即可使用；后台接口是否允许执行仍由当前登录账号的后端权限决定。点击“全部重置子商户号”时，微信和支付宝流程会并行执行，其中一边失败不会中止另一边。

### 联合收单微信

1. 校验乐刷商户号必须是 10 位数字。
2. 调用微信上报接口。
3. 获取上报接口返回的新微信子商户号。
4. 上报后等待 3 秒。
5. 每隔 1.5 秒查询新微信子商户号映射记录。
6. 最近 3 次查询到的“未通知”通道集合一致后，设置新微信子商户号为启用。
7. 查询 5 年内旧启用微信子商户号，并按 `微信子商户号 + payType` 分组禁用旧号。

联合收单微信需要手动启用新上报的“未通知”记录。

### 联合收单支付宝

1. 校验乐刷商户号必须是 10 位数字。
2. 调用支付宝上报接口。
3. 获取新支付宝子商户号。
4. 轮询确认新支付宝子商户号已启用。
5. 查询 5 年内旧启用支付宝子商户号，并按分组禁用旧号。

支付宝上报成功后，新支付宝子商户号默认已启用，因此不需要手动启用新号。

### 收银通微信

1. 校验乐刷商户号必须是 10 位数字。
2. 调用收银通微信上报接口。
3. 从响应 `data.wxMchId` 获取新微信子商户号。
4. 上报后等待 3 秒。
5. 查询新微信子商户号是否已启用；未查到则每隔 2 秒重试，最多重试 3 次。
6. 查询 5 年内旧启用微信子商户号，并按分组禁用旧号。

收银通微信上报参数里 `notice=1` 表示启用通知，新号上报后不需要再手动启用，只需要确认启用成功。

### 收银通支付宝

1. 校验乐刷商户号必须是 10 位数字。
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
| `README.md` | 项目说明和维护入口 |


5. 在 Tampermonkey 中手动检查更新，确认脚本版本已变更。

